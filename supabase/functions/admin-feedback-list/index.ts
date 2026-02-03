import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

// Verify admin token
async function verifyToken(token: string, secret: string): Promise<boolean> {
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

    // Check expiration
    const payload = JSON.parse(atob(payloadBase64));
    if (payload.exp < Date.now()) return false;
    if (payload.type !== "admin") return false;

    return true;
  } catch {
    return false;
  }
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

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "X-Request-Id": requestId } });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed", requestId }),
      { status: 405, headers: responseHeaders() }
    );
  }

  // Check origin for browser requests
  if (origin && !isAllowedOrigin(origin)) {
    console.error({ requestId, action: "feedback_list_blocked", origin });
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
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized", requestId }),
        { status: 401, headers: responseHeaders() }
      );
    }

    const isValid = await verifyToken(adminToken, tokenSecret);
    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_token", requestId }),
        { status: 401, headers: responseHeaders() }
      );
    }

    // Parse query params
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query
    let query = supabase
      .from("feedback")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ["new", "read", "resolved", "archived"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error({ requestId, action: "feedback_list_error", error: error.message });
      return new Response(
        JSON.stringify({ success: false, error: "database_error", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Generate signed URLs for images
    const feedbackWithUrls = await Promise.all(
      (data || []).map(async (item) => {
        if (item.image_url) {
          const { data: signedData } = await supabase.storage
            .from("feedback-attachments")
            .createSignedUrl(item.image_url, 3600); // 1 hour
          
          return {
            ...item,
            image_signed_url: signedData?.signedUrl || null,
          };
        }
        return { ...item, image_signed_url: null };
      })
    );

    console.log({ requestId, action: "feedback_list_success", count, limit, offset });

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: feedbackWithUrls, 
        total: count,
        limit,
        offset,
        requestId 
      }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "feedback_list_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});