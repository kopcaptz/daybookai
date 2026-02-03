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

// Verify admin token (same as admin-feedback-list)
async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payloadBase64, signatureBase64] = token.split(".");
    if (!payloadBase64 || !signatureBase64) return false;

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
    console.error({ requestId, action: "analytics_blocked", origin });
    return new Response(
      JSON.stringify({ success: false, error: "origin_not_allowed", requestId }),
      { status: 403, headers: responseHeaders() }
    );
  }

  try {
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

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "7", 10);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: analytics, error } = await supabase
      .from("usage_analytics")
      .select("*")
      .gte("date", startDate.toISOString().slice(0, 10))
      .lte("date", endDate.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    if (error) {
      console.error({ requestId, action: "analytics_fetch_error", error: error.message });
      return new Response(
        JSON.stringify({ success: false, error: "database_error", requestId }),
        { status: 500, headers: responseHeaders() }
      );
    }

    // Aggregate metrics
    const uniqueSessions = new Set<string>();
    const uniqueVersions = new Set<string>();
    const dailyMap = new Map<string, { sessions: number; entries: number; aiMessages: number }>();
    
    const aggregated = {
      entriesCreated: 0,
      entriesEdited: 0,
      aiChatMessages: 0,
      aiBiographiesGenerated: 0,
      autoMoodSuggestions: 0,
      autoMoodAccepted: 0,
      autoTagsSuggested: 0,
      autoTagsAccepted: 0,
      feedbackSubmitted: 0,
      totalSessionMinutes: 0,
    };

    for (const record of analytics || []) {
      uniqueSessions.add(record.session_id);
      if (record.app_version) {
        uniqueVersions.add(record.app_version);
      }

      const metrics = record.metrics as Record<string, number>;
      
      aggregated.entriesCreated += metrics.entriesCreated || 0;
      aggregated.entriesEdited += metrics.entriesEdited || 0;
      aggregated.aiChatMessages += metrics.aiChatMessages || 0;
      aggregated.aiBiographiesGenerated += metrics.aiBiographiesGenerated || 0;
      aggregated.autoMoodSuggestions += metrics.autoMoodSuggestions || 0;
      aggregated.autoMoodAccepted += metrics.autoMoodAccepted || 0;
      aggregated.autoTagsSuggested += metrics.autoTagsSuggested || 0;
      aggregated.autoTagsAccepted += metrics.autoTagsAccepted || 0;
      aggregated.feedbackSubmitted += metrics.feedbackSubmitted || 0;
      aggregated.totalSessionMinutes += metrics.sessionDurationMinutes || 0;

      // Daily breakdown
      const date = record.date;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { sessions: 0, entries: 0, aiMessages: 0 });
      }
      const day = dailyMap.get(date)!;
      day.sessions += 1;
      day.entries += metrics.entriesCreated || 0;
      day.aiMessages += metrics.aiChatMessages || 0;
    }

    const totalSessions = uniqueSessions.size;
    const avgSessionMinutes = totalSessions > 0 
      ? Math.round(aggregated.totalSessionMinutes / totalSessions) 
      : 0;

    const dailyData = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const summary = {
      totalSessions,
      uniqueVersions: Array.from(uniqueVersions).sort().reverse(),
      aggregatedMetrics: {
        entriesCreated: aggregated.entriesCreated,
        entriesEdited: aggregated.entriesEdited,
        aiChatMessages: aggregated.aiChatMessages,
        aiBiographiesGenerated: aggregated.aiBiographiesGenerated,
        autoMoodSuggestions: aggregated.autoMoodSuggestions,
        autoMoodAccepted: aggregated.autoMoodAccepted,
        autoTagsSuggested: aggregated.autoTagsSuggested,
        autoTagsAccepted: aggregated.autoTagsAccepted,
        feedbackSubmitted: aggregated.feedbackSubmitted,
        avgSessionMinutes,
      },
      dailyData,
    };

    console.log({ requestId, action: "analytics_summary", totalSessions, days });

    return new Response(
      JSON.stringify({ success: true, summary, requestId }),
      { status: 200, headers: responseHeaders() }
    );
  } catch (error) {
    console.error({ requestId, action: "analytics_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: responseHeaders() }
    );
  }
});