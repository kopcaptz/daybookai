import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration - allow known origins
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];
const LOVABLE_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.lovable\.app$/;
const LOVABLE_PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (LOVABLE_PREVIEW_PATTERN.test(origin)) return true;
  if (LOVABLE_PROJECT_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// AI Token validation (same as ai-chat)
async function validateAIToken(token: string | null, requestId: string): Promise<{ valid: boolean; error?: string }> {
  if (!token) {
    return { valid: false, error: "auth_required" };
  }

  const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");
  if (!AI_TOKEN_SECRET) {
    console.error({ requestId, action: "token_validation_error", error: "AI_TOKEN_SECRET not configured" });
    return { valid: false, error: "service_not_configured" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "invalid_token_format" };
  }

  const [payloadBase64, signatureBase64] = parts;

  try {
    // Verify HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(AI_TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(payloadBase64)
    );

    if (!isValid) {
      return { valid: false, error: "invalid_token_signature" };
    }

    // Decode and check expiry
    const payload = JSON.parse(atob(payloadBase64));
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) {
      return { valid: false, error: "token_expired" };
    }

    return { valid: true };
  } catch (e) {
    console.error({ requestId, action: "token_validation_error", error: String(e) });
    return { valid: false, error: "invalid_token" };
  }
}

// Allowed MIME types for audio (includes video/webm as browsers sometimes report audio as video)
const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "video/webm",      // browsers often report webm audio as video/webm
  "application/ogg", // some browsers
];

function isAllowedAudioType(mimeType: string): boolean {
  const lowerMime = mimeType.toLowerCase();
  return ALLOWED_AUDIO_TYPES.some(allowed => lowerMime.startsWith(allowed));
}

// Max file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  const responseHeaders = (contentType: string = "application/json") => ({
    ...corsHeaders,
    "Content-Type": contentType,
    "X-Request-Id": requestId,
  });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_transcribe_unauthorized", error: tokenValidation.error });
    return new Response(
      JSON.stringify({ error: tokenValidation.error, requestId }),
      { status: 401, headers: responseHeaders() }
    );
  }

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file");
    const languageHint = formData.get("languageHint") as string || "auto";

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "file_required", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.log({ requestId, action: "ai_transcribe_too_large", sizeBytes: file.size });
      return new Response(
        JSON.stringify({ error: "too_large", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Validate MIME type
    if (!isAllowedAudioType(file.type)) {
      console.log({ requestId, action: "ai_transcribe_unsupported_format", mimeType: file.type });
      return new Response(
        JSON.stringify({ error: "unsupported_format", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    // Log request metadata (never log audio content)
    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_transcribe_request",
      mimeType: file.type,
      sizeBytes: file.size,
      languageHint,
    });

    // Get API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error({ requestId, action: "ai_transcribe_error", error: "LOVABLE_API_KEY not configured" });
      return new Response(
        JSON.stringify({ error: "service_not_configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Convert audio to base64 for Gemini (server-side only)
    const audioBytes = await file.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBytes)));

    // Build prompt for Gemini
    const systemPrompt = `You are a transcription assistant. Transcribe the following audio accurately.
Return ONLY the transcription text, no commentary, timestamps, or additional formatting.
If the audio is empty or contains only noise, return an empty string.
${languageHint !== "auto" ? `Language hint: ${languageHint}. Prioritize this language for transcription.` : "Auto-detect the language."}`;

    // Call Lovable AI Gateway with multimodal content
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Please transcribe this audio:" },
              {
                type: "image_url",
                image_url: {
                  url: `data:${file.type};base64,${audioBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1, // Low temperature for accurate transcription
      }),
    });

    // Handle rate limiting
    if (response.status === 429) {
      console.log({ requestId, action: "ai_transcribe_rate_limited" });
      return new Response(
        JSON.stringify({ error: "rate_limited", requestId }),
        { status: 429, headers: responseHeaders() }
      );
    }

    // Handle payment required
    if (response.status === 402) {
      console.log({ requestId, action: "ai_transcribe_payment_required" });
      return new Response(
        JSON.stringify({ error: "payment_required", requestId }),
        { status: 402, headers: responseHeaders() }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_transcribe_gateway_error", status: response.status, error: errorText });
      return new Response(
        JSON.stringify({ error: "transcription_failed", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    const result = await response.json();
    const transcriptText = result.choices?.[0]?.message?.content?.trim() || "";

    // Detect language from response (simplified - could be enhanced)
    let detectedLanguage = languageHint !== "auto" ? languageHint : "en";
    // Simple heuristic: check for Cyrillic, Hebrew, Arabic characters
    if (/[\u0400-\u04FF]/.test(transcriptText)) detectedLanguage = "ru";
    else if (/[\u0590-\u05FF]/.test(transcriptText)) detectedLanguage = "he";
    else if (/[\u0600-\u06FF]/.test(transcriptText)) detectedLanguage = "ar";

    console.log({
      requestId,
      action: "ai_transcribe_success",
      detectedLanguage,
      textLength: transcriptText.length,
    });

    return new Response(
      JSON.stringify({
        text: transcriptText,
        language: detectedLanguage,
        model: "google/gemini-2.5-flash",
      }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_transcribe_error", error: String(error) });
    return new Response(
      JSON.stringify({ error: "transcription_failed", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
