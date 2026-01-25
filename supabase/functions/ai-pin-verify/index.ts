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
  if (!origin) return true; // Allow non-browser requests (curl, etc.)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (LOVABLE_PREVIEW_PATTERN.test(origin)) return true;
  if (LOVABLE_PROJECT_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Token generation using HMAC-SHA256
async function createToken(secret: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const payload = JSON.stringify({ iat: now, exp: expiresAt });
  const payloadBase64 = btoa(payload);
  
  // Create HMAC signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return {
    token: `${payloadBase64}.${signatureBase64}`,
    expiresAt,
  };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const responseHeaders = (extra?: Record<string, string>) => ({
    ...corsHeaders,
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...extra,
  });

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  // Only allow POST
  if (req.method !== "POST") {
    console.error({ requestId, action: "pin_verify_error", error: "Method not allowed" });
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  // Check origin for browser requests
  if (origin && !isAllowedOrigin(origin)) {
    console.error({ requestId, action: "pin_verify_blocked", origin });
    return new Response(
      JSON.stringify({ success: false, error: "origin_not_allowed", requestId }),
      { status: 403, headers: responseHeaders() }
    );
  }

  try {
    const body = await req.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      console.log({ requestId, action: "pin_verify_invalid_input" });
      return new Response(
        JSON.stringify({ success: false, error: "invalid_input", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const AI_ACCESS_PIN = Deno.env.get("AI_ACCESS_PIN");
    const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");

    if (!AI_ACCESS_PIN || !AI_TOKEN_SECRET) {
      console.error({ requestId, action: "pin_verify_not_configured" });
      return new Response(
        JSON.stringify({ success: false, error: "service_not_configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Validate PIN (constant-time comparison to prevent timing attacks)
    const pinBuffer = new TextEncoder().encode(pin.padEnd(16, "\0"));
    const expectedBuffer = new TextEncoder().encode(AI_ACCESS_PIN.padEnd(16, "\0"));
    
    let match = true;
    for (let i = 0; i < 16; i++) {
      if (pinBuffer[i] !== expectedBuffer[i]) {
        match = false;
      }
    }

    if (!match) {
      console.log({ requestId, action: "pin_verify_failed" });
      return new Response(
        JSON.stringify({ success: false, error: "invalid_pin", requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // Generate token with 7-day TTL
    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const { token, expiresAt } = await createToken(AI_TOKEN_SECRET, TTL_MS);

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "pin_verify_success",
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, token, expiresAt, requestId }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "pin_verify_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
