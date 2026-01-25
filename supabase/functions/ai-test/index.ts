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

// AI Token validation
async function validateAIToken(token: string | null, requestId: string): Promise<{ valid: boolean; error?: string }> {
  if (!token) {
    return { valid: false, error: "ai_token_required" };
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

serve(async (req) => {
  // Generate request ID for correlation
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const responseHeaders = () => ({
    ...corsHeaders,
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  // Only allow POST requests for security
  if (req.method !== "POST") {
    console.error({ requestId, action: "ai_test_error", error: "Method not allowed" });
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  // Validate AI token
  const aiToken = req.headers.get("X-AI-Token");
  const tokenValidation = await validateAIToken(aiToken, requestId);
  if (!tokenValidation.valid) {
    console.log({ requestId, action: "ai_test_unauthorized", error: tokenValidation.error });
    return new Response(
      JSON.stringify({ success: false, error: tokenValidation.error, requestId }),
      { status: 401, headers: responseHeaders() }
    );
  }

  try {
    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_test_request",
    });

    // Try LOVABLE_API_KEY first, then OpenRouter
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("VITE_AI_API_KEY");
    
    let apiUrl: string;
    let apiKey: string;
    let headers: Record<string, string>;
    let source: string;
    
    if (LOVABLE_API_KEY) {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = LOVABLE_API_KEY;
      source = "Lovable AI Gateway";
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    } else if (OPENROUTER_API_KEY) {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      apiKey = OPENROUTER_API_KEY;
      source = "OpenRouter";
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      };
    } else {
      console.log({ requestId, action: "ai_test_no_config" });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "AI service not configured",
          source: "none",
          requestId
        }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // Simple test request with minimal tokens
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: LOVABLE_API_KEY ? "google/gemini-3-flash-preview" : "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_test_gateway_error", status: response.status, error: errorText, source });
      
      let errorMessage = `Error: ${response.status}`;
      if (response.status === 401) errorMessage = "Invalid API key (401)";
      else if (response.status === 403) errorMessage = "Access denied (403)";
      else if (response.status === 429) errorMessage = "Rate limit exceeded (429)";
      else if (response.status === 402) errorMessage = "Payment required (402)";
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, source, requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "ai_test_success",
      source,
    });

    return new Response(
      JSON.stringify({ success: true, source, requestId }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_test_error", error: String(error) });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Network error",
        source: "unknown",
        requestId
      }),
      { status: 200, headers: responseHeaders() }
    );
  }
});
