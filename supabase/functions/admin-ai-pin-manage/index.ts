import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Verify admin token using HMAC-SHA256
async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payloadBase64, signatureBase64] = token.split(".");
    if (!payloadBase64 || !signatureBase64) return false;

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payloadBase64));
    if (!valid) return false;

    // Check expiry
    const payload = JSON.parse(atob(payloadBase64));
    if (!payload.exp || payload.exp < Date.now()) return false;
    if (payload.type !== "admin") return false;

    return true;
  } catch {
    return false;
  }
}

// Hash PIN using HMAC-SHA256 (deterministic, keyed)
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
  // Convert to hex string for storage
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate random 4-digit PIN
function generatePin(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 10000).padStart(4, "0");
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

  // Check origin
  if (origin && !isAllowedOrigin(origin)) {
    console.error({ requestId, action: "ai_pin_manage_blocked", origin });
    return new Response(
      JSON.stringify({ success: false, error: "origin_not_allowed", requestId }),
      { status: 403, headers: responseHeaders() }
    );
  }

  // Verify admin token
  const adminToken = req.headers.get("x-admin-token");
  const AI_TOKEN_SECRET = Deno.env.get("AI_TOKEN_SECRET");

  if (!AI_TOKEN_SECRET) {
    console.error({ requestId, action: "ai_pin_manage_not_configured" });
    return new Response(
      JSON.stringify({ success: false, error: "service_not_configured", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }

  if (!adminToken || !(await verifyAdminToken(adminToken, AI_TOKEN_SECRET))) {
    console.error({ requestId, action: "ai_pin_manage_unauthorized" });
    return new Response(
      JSON.stringify({ success: false, error: "unauthorized", requestId }),
      { status: 401, headers: responseHeaders() }
    );
  }

  // Initialize Supabase client with service role
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET — return status (when was PIN last changed)
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("app_settings")
        .select("updated_at")
        .eq("key", "ai_pin_hash")
        .maybeSingle();

      if (error) {
        console.error({ requestId, action: "ai_pin_manage_db_error", error: error.message });
        return new Response(
          JSON.stringify({ success: false, error: "db_error", requestId }),
          { status: 500, headers: responseHeaders() }
        );
      }

      console.log({ requestId, action: "ai_pin_status", hasPin: !!data });

      return new Response(
        JSON.stringify({
          success: true,
          configured: !!data,
          updatedAt: data?.updated_at || null,
          requestId,
        }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // POST — generate new PIN
    if (req.method === "POST") {
      let invalidateSessions = false;
      try {
        const body = await req.json();
        invalidateSessions = body?.invalidateSessions === true;
      } catch {
        // No body or invalid JSON — that's fine, defaults apply
      }

      // Generate new PIN
      const newPin = generatePin();
      const pinHash = await hashPin(AI_TOKEN_SECRET, newPin);

      // Upsert into app_settings
      const { error: upsertError } = await supabase
        .from("app_settings")
        .upsert(
          {
            key: "ai_pin_hash",
            value: pinHash,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (upsertError) {
        console.error({ requestId, action: "ai_pin_manage_upsert_error", error: upsertError.message });
        return new Response(
          JSON.stringify({ success: false, error: "db_error", requestId }),
          { status: 500, headers: responseHeaders() }
        );
      }

      // Optionally invalidate all existing AI tokens by setting epoch
      if (invalidateSessions) {
        await supabase
          .from("app_settings")
          .upsert(
            {
              key: "ai_token_epoch",
              value: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
        console.log({ requestId, action: "ai_sessions_invalidated" });
      }

      console.log({
        requestId,
        action: "ai_pin_generated",
        invalidateSessions,
        timestamp: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          success: true,
          pin: newPin,
          requestId,
        }),
        { status: 200, headers: responseHeaders() }
      );
    }

    // Other methods not allowed
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "ai_pin_manage_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});
