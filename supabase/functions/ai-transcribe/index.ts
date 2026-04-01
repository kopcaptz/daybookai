import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "https://daybookai.lovable.app",
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Provider routing — transcription is multimodal (audio base64), so OpenRouter/MiniMax may not support it.
// We still route through the provider if selected, but fall back to Lovable if the provider doesn't support multimodal.
function getProviderConfig(provider: string, providerKey?: string): {
  apiUrl: string;
  headers: Record<string, string>;
  effectiveModel: string;
} | null {
  if (provider === "openrouter") {
    if (!providerKey) return null;
    return {
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${providerKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      },
      effectiveModel: "google/gemini-2.5-flash",
    };
  }
  // MiniMax doesn't support multimodal audio — always use Lovable for transcription
  // Default: lovable
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  return {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    effectiveModel: "google/gemini-2.5-flash",
  };
}

const ALLOWED_AUDIO_TYPES = [
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav",
  "audio/mp4", "audio/x-m4a", "audio/aac", "video/webm", "application/ogg",
];

function isAllowedAudioType(mimeType: string): boolean {
  const lowerMime = mimeType.toLowerCase();
  return ALLOWED_AUDIO_TYPES.some(allowed => lowerMime.startsWith(allowed));
}

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

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const languageHint = formData.get("languageHint") as string || "auto";
    const provider = formData.get("provider") as string || "lovable";

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "file_required", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "too_large", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!isAllowedAudioType(file.type)) {
      return new Response(
        JSON.stringify({ error: "unsupported_format", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    console.log({ requestId, action: "ai_transcribe_request", mimeType: file.type, sizeBytes: file.size, languageHint, provider });

    const userProviderKey = req.headers.get("X-Provider-Key") || undefined;
    const providerConfig = getProviderConfig(provider, userProviderKey);
    if (!providerConfig) {
      return new Response(
        JSON.stringify({ error: provider === "lovable" ? "service_not_configured" : "provider_key_required", requestId }),
        { status: provider === "lovable" ? 500 : 401, headers: responseHeaders() }
      );
    }

    const audioBytes = await file.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBytes)));

    const systemPrompt = `You are a transcription assistant. Transcribe the following audio accurately.
Return ONLY the transcription text, no commentary, timestamps, or additional formatting.
If the audio is empty or contains only noise, return an empty string.
${languageHint !== "auto" ? `Language hint: ${languageHint}. Prioritize this language for transcription.` : "Auto-detect the language."}`;

    const response = await fetch(providerConfig.apiUrl, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify({
        model: providerConfig.effectiveModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Please transcribe this audio:" },
              {
                type: "image_url",
                image_url: { url: `data:${file.type};base64,${audioBase64}` },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited", requestId }), { status: 429, headers: responseHeaders() });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "payment_required", requestId }), { status: 402, headers: responseHeaders() });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_transcribe_gateway_error", status: response.status, error: errorText });
      return new Response(JSON.stringify({ error: "transcription_failed", requestId }), { status: 500, headers: responseHeaders() });
    }

    const result = await response.json();
    const transcriptText = result.choices?.[0]?.message?.content?.trim() || "";

    let detectedLanguage = languageHint !== "auto" ? languageHint : "en";
    if (/[\u0400-\u04FF]/.test(transcriptText)) detectedLanguage = "ru";
    else if (/[\u0590-\u05FF]/.test(transcriptText)) detectedLanguage = "he";
    else if (/[\u0600-\u06FF]/.test(transcriptText)) detectedLanguage = "ar";

    console.log({ requestId, action: "ai_transcribe_success", detectedLanguage, textLength: transcriptText.length });

    return new Response(
      JSON.stringify({ text: transcriptText, language: detectedLanguage, model: providerConfig.effectiveModel }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_transcribe_error", error: String(error) });
    return new Response(JSON.stringify({ error: "transcription_failed", requestId }), { status: 500, headers: responseHeaders() });
  }
});
