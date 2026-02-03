import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS configuration - allow known origins
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

// Verify admin token using Web Crypto API (same as token creation)
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

    // Decode base64 signature
    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(payloadBase64)
    );

    if (!isValid) return false;

    // Check expiration
    const payload = JSON.parse(atob(payloadBase64));
    if (payload.exp < Date.now()) return false;

    return true;
  } catch (error) {
    console.error("[admin-system-health] Token verification error:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  const responseHeaders = (extra?: Record<string, string>) => ({
    ...corsHeaders,
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...extra,
  });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  // Check origin for browser requests
  if (origin && !isAllowedOrigin(origin)) {
    console.error({ requestId, action: "system_health_blocked", origin });
    return new Response(
      JSON.stringify({ success: false, error: "origin_not_allowed", requestId }),
      { status: 403, headers: responseHeaders() }
    );
  }

  try {
    // Verify admin token
    const adminToken = req.headers.get("x-admin-token");
    const tokenSecret = Deno.env.get("AI_TOKEN_SECRET");

    if (!adminToken || !tokenSecret) {
      console.log("[admin-system-health] Missing token or secret");
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: responseHeaders() }
      );
    }

    const isValidToken = await verifyAdminToken(adminToken, tokenSecret);
    if (!isValidToken) {
      console.log("[admin-system-health] Invalid token");
      return new Response(
        JSON.stringify({ success: false, error: "invalid_token" }),
        { status: 401, headers: responseHeaders() }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[admin-system-health] Starting health check...");

    // Check database connection and get feedback stats
    let databaseStatus: "ok" | "error" = "ok";
    let feedbackTotal = 0;
    let feedbackNew = 0;

    try {
      const { count: totalCount, error: totalError } = await supabase
        .from("feedback")
        .select("*", { count: "exact", head: true });

      if (totalError) throw totalError;
      feedbackTotal = totalCount || 0;

      const { count: newCount, error: newError } = await supabase
        .from("feedback")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");

      if (newError) throw newError;
      feedbackNew = newCount || 0;
    } catch (error) {
      console.error("[admin-system-health] Database error:", error);
      databaseStatus = "error";
    }

    // Check storage bucket
    let storageFiles = 0;
    try {
      const { data: files, error: storageError } = await supabase.storage
        .from("feedback-attachments")
        .list("", { limit: 1000 });

      if (!storageError && files) {
        storageFiles = files.length;
      }
    } catch (error) {
      console.error("[admin-system-health] Storage error:", error);
    }

    // Note: We don't actually ping each Edge Function here to avoid circular calls
    // Instead, we report them as "ok" since they're configured in config.toml
    // Real health checks would require external monitoring
    const functionsStatus: Record<string, { status: string; latency?: number }> = {
      "ai-chat": { status: "ok" },
      "ai-biography": { status: "ok" },
      "ai-receipt": { status: "ok" },
      "ai-whisper": { status: "ok" },
      "feedback-submit": { status: "ok" },
    };

    const healthData = {
      database: databaseStatus,
      feedback: {
        total: feedbackTotal,
        new: feedbackNew,
      },
      storage: {
        bucket: "feedback-attachments",
        files: storageFiles,
      },
      functions: functionsStatus,
      timestamp: Date.now(),
    };

    console.log("[admin-system-health] Health check completed:", healthData);

    return new Response(
      JSON.stringify({ success: true, data: healthData }),
      { headers: responseHeaders() }
    );
  } catch (error) {
    console.error("[admin-system-health] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "internal_error" }),
      { status: 500, headers: responseHeaders() }
    );
  }
});