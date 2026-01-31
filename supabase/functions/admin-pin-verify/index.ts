import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Token generation using HMAC-SHA256
async function createToken(secret: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const payload = JSON.stringify({ iat: now, exp: expiresAt, type: "admin" });
  const payloadBase64 = btoa(payload);
  
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

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed", requestId }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_input", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ADMIN_PIN = Deno.env.get("ADMIN_PIN");
    const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");

    if (!ADMIN_PIN || !AI_TOKEN_SECRET) {
      console.error({ requestId, action: "admin_pin_not_configured" });
      return new Response(
        JSON.stringify({ success: false, error: "service_not_configured", requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Constant-time comparison
    const pinBuffer = new TextEncoder().encode(pin.padEnd(16, "\0"));
    const expectedBuffer = new TextEncoder().encode(ADMIN_PIN.padEnd(16, "\0"));
    
    let match = true;
    for (let i = 0; i < 16; i++) {
      if (pinBuffer[i] !== expectedBuffer[i]) {
        match = false;
      }
    }

    if (!match) {
      console.log({ requestId, action: "admin_pin_failed" });
      return new Response(
        JSON.stringify({ success: false, error: "invalid_pin", requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate token with 24-hour TTL
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const { token, expiresAt } = await createToken(AI_TOKEN_SECRET, TTL_MS);

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "admin_pin_success",
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, token, expiresAt, requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "admin_pin_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
