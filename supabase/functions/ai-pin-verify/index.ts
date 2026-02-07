import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS configuration - allow known origins
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];
const LOVABLE_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.lovable\.app$/;
const LOVABLE_PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
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
): Promise<{ allowed: boolean; retryAfter?: number; remainingAttempts?: number }> {
  const { data } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .maybeSingle();

  const record = data as RateLimitRecord | null;
  if (!record) return { allowed: true, remainingAttempts: RATE_LIMIT.MAX_ATTEMPTS };

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
    return { allowed: true, remainingAttempts: RATE_LIMIT.MAX_ATTEMPTS };
  }

  return { 
    allowed: true, 
    remainingAttempts: Math.max(0, RATE_LIMIT.MAX_ATTEMPTS - record.fail_count) 
  };
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

// Hash PIN using HMAC-SHA256 (must match admin-ai-pin-manage)
async function hashPin(secret: string, pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(pin));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Token generation using HMAC-SHA256
async function createToken(secret: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const payload = JSON.stringify({ iat: now, exp: expiresAt });
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

  // Initialize Supabase client with service role
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const clientId = getClientIdentifier(req);
  const endpoint = "ai-pin";

  try {
    // Check rate limit BEFORE parsing body
    const rateCheck = await checkRateLimit(supabase, clientId, endpoint);
    if (!rateCheck.allowed) {
      console.log({ requestId, action: "pin_verify_rate_limited", clientId, retryAfter: rateCheck.retryAfter });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "rate_limited", 
          retryAfter: rateCheck.retryAfter,
          requestId 
        }),
        { 
          status: 429, 
          headers: responseHeaders({ "Retry-After": String(rateCheck.retryAfter) }) 
        }
      );
    }

    const body = await req.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string") {
      console.log({ requestId, action: "pin_verify_invalid_input" });
      return new Response(
        JSON.stringify({ success: false, error: "invalid_input", requestId }),
        { status: 400, headers: responseHeaders() }
      );
    }

    const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");

    if (!AI_TOKEN_SECRET) {
      console.error({ requestId, action: "pin_verify_not_configured" });
      return new Response(
        JSON.stringify({ success: false, error: "service_not_configured", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // ---- PIN verification: DB hash first, env fallback ----
    let match = false;

    // 1. Try DB hash (dynamic PIN from admin panel)
    const { data: pinSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_pin_hash")
      .maybeSingle();

    if (pinSetting?.value) {
      // Hash the input PIN the same way and compare
      const inputHash = await hashPin(AI_TOKEN_SECRET, pin);
      match = timingSafeEqual(inputHash, pinSetting.value);
      console.log({ requestId, action: "pin_verify_method", method: "db_hash", match });
    }

    // 2. Fallback: env variable (legacy static PIN)
    if (!match) {
      const AI_ACCESS_PIN = Deno.env.get("AI_ACCESS_PIN");
      if (AI_ACCESS_PIN) {
        const pinBuffer = new TextEncoder().encode(pin.padEnd(16, "\0"));
        const expectedBuffer = new TextEncoder().encode(AI_ACCESS_PIN.padEnd(16, "\0"));
        let envMatch = true;
        for (let i = 0; i < 16; i++) {
          if (pinBuffer[i] !== expectedBuffer[i]) {
            envMatch = false;
          }
        }
        match = envMatch;
        if (match) {
          console.log({ requestId, action: "pin_verify_method", method: "env_fallback" });
        }
      }
    }

    if (!match) {
      // Record failed attempt
      const failResult = await recordFailedAttempt(supabase, clientId, endpoint);
      console.log({ 
        requestId, 
        action: "pin_verify_failed", 
        clientId,
        blocked: failResult.blocked 
      });

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
            headers: responseHeaders({ "Retry-After": String(failResult.retryAfter) }) 
          }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "invalid_pin", requestId }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // Success - clear rate limit and generate token
    await clearRateLimit(supabase, clientId, endpoint);

    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const { token, expiresAt } = await createToken(AI_TOKEN_SECRET, TTL_MS);

    console.log({
      requestId,
      timestamp: new Date().toISOString(),
      action: "pin_verify_success",
      clientId,
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
