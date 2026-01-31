import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit configuration
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  BLOCK_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

// Rate limit record type
interface RateLimitRecord {
  identifier: string;
  endpoint: string;
  fail_count: number;
  last_attempt_at: string;
  blocked_until: string | null;
}

function getClientIdentifier(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return ip;
}

// deno-lint-ignore no-explicit-any
async function checkRateLimit(
  supabase: any,
  identifier: string,
  endpoint: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const { data } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .maybeSingle();

  const record = data as RateLimitRecord | null;
  if (!record) return { allowed: true };

  if (record.blocked_until && new Date(record.blocked_until) > new Date()) {
    const retryAfter = Math.ceil(
      (new Date(record.blocked_until).getTime() - Date.now()) / 1000
    );
    return { allowed: false, retryAfter };
  }

  if (record.blocked_until && new Date(record.blocked_until) <= new Date()) {
    await supabase
      .from("rate_limits")
      .update({ fail_count: 0, blocked_until: null })
      .eq("identifier", identifier)
      .eq("endpoint", endpoint);
    return { allowed: true };
  }

  return { allowed: true };
}

// deno-lint-ignore no-explicit-any
async function recordFailedAttempt(
  supabase: any,
  identifier: string,
  endpoint: string
): Promise<{ blocked: boolean; retryAfter?: number }> {
  const { data } = await supabase
    .from("rate_limits")
    .select("fail_count")
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .maybeSingle();

  const record = data as { fail_count: number } | null;
  const newCount = (record?.fail_count || 0) + 1;
  const shouldBlock = newCount >= RATE_LIMIT.MAX_ATTEMPTS;
  const blockedUntil = shouldBlock
    ? new Date(Date.now() + RATE_LIMIT.BLOCK_DURATION_MS).toISOString()
    : null;

  await supabase.from("rate_limits").upsert(
    {
      identifier,
      endpoint,
      fail_count: newCount,
      last_attempt_at: new Date().toISOString(),
      blocked_until: blockedUntil,
    },
    { onConflict: "identifier,endpoint" }
  );

  return {
    blocked: shouldBlock,
    retryAfter: shouldBlock ? Math.ceil(RATE_LIMIT.BLOCK_DURATION_MS / 1000) : undefined,
  };
}

// deno-lint-ignore no-explicit-any
async function clearRateLimit(
  supabase: any,
  identifier: string,
  endpoint: string
): Promise<void> {
  await supabase
    .from("rate_limits")
    .delete()
    .eq("identifier", identifier)
    .eq("endpoint", endpoint);
}

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

  // Initialize Supabase client with service role for rate limiting
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const clientId = getClientIdentifier(req);
  const endpoint = "admin-pin";

  try {
    // Check rate limit
    const rateCheck = await checkRateLimit(supabase, clientId, endpoint);
    if (!rateCheck.allowed) {
      console.log({ requestId, action: "admin_pin_rate_limited", clientId, retryAfter: rateCheck.retryAfter });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "rate_limited", 
          retryAfter: rateCheck.retryAfter,
          requestId 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter) 
          } 
        }
      );
    }

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
      const failResult = await recordFailedAttempt(supabase, clientId, endpoint);
      console.log({ requestId, action: "admin_pin_failed", clientId, blocked: failResult.blocked });

      if (failResult.blocked) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "rate_limited", 
            retryAfter: failResult.retryAfter,
            requestId 
          }),
          { 
            status: 429, 
            headers: { 
              ...corsHeaders, 
              "Content-Type": "application/json",
              "Retry-After": String(failResult.retryAfter) 
            } 
          }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "invalid_pin", requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success - clear rate limit
    await clearRateLimit(supabase, clientId, endpoint);

    // Generate token with 24-hour TTL
    const TTL_MS = 24 * 60 * 60 * 1000;
    const { token, expiresAt } = await createToken(AI_TOKEN_SECRET, TTL_MS);

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "admin_pin_success",
      clientId,
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
