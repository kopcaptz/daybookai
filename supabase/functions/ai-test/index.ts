import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS configuration
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-token, x-provider-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}


// Provider test configurations
function getTestConfig(provider: string, providerKey?: string): { apiUrl: string; apiKey: string | undefined; headers: Record<string, string>; model: string; source: string } | null {
  if (provider === "openrouter") {
    const apiKey = providerKey;
    if (!apiKey) return null;
    return {
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Daybook",
        "HTTP-Referer": "https://daybook.local",
      },
      model: "google/gemini-2.5-flash-lite",
      source: providerKey ? "OpenRouter (user key)" : "OpenRouter",
    };
  }

  if (provider === "minimax") {
    const apiKey = providerKey;
    if (!apiKey) return null;
    return {
      apiUrl: "https://api.minimax.io/v1/chat/completions",
      apiKey,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      model: "MiniMax-M1",
      source: providerKey ? "MiniMax (user key)" : "MiniMax",
    };
  }

  // Default: lovable
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      model: "google/gemini-3-flash-preview",
      source: "Lovable AI Gateway",
    };
  }

  return null;
}

serve(async (req) => {
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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }


  try {
    // Parse optional provider from body
    let provider = "lovable";
    try {
      const body = await req.json();
      if (body?.provider && typeof body.provider === "string") {
        provider = body.provider;
      }
    } catch { /* empty body is OK */ }

    console.log({ requestId, timestamp: new Date().toISOString(), action: "ai_test_request", provider });

    const userProviderKey = req.headers.get("X-Provider-Key") || undefined;
    const config = getTestConfig(provider, userProviderKey);
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: `Provider "${provider}" not configured`, source: provider, requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error({ requestId, action: "ai_test_gateway_error", status: response.status, error: errorText, source: config.source });
      
      let errorMessage = `Error: ${response.status}`;
      if (response.status === 401) errorMessage = "Invalid API key (401)";
      else if (response.status === 403) errorMessage = "Access denied (403)";
      else if (response.status === 429) errorMessage = "Rate limit exceeded (429)";
      else if (response.status === 402) errorMessage = "Payment required (402)";
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, source: config.source, requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    console.log({ requestId, timestamp: new Date().toISOString(), action: "ai_test_success", source: config.source });

    return new Response(
      JSON.stringify({ success: true, source: config.source, requestId }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_test_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "Network error", source: "unknown", requestId }),
      { status: 200, headers: responseHeaders() }
    );
  }
});
