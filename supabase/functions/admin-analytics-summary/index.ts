import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Verify admin token
async function verifyAdminToken(token: string): Promise<boolean> {
  const adminPin = Deno.env.get("ADMIN_PIN");
  if (!adminPin) return false;
  
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return false;
    
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(adminPin),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const expectedSig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload)
    );
    
    const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    return signature === expectedSigB64;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed", requestId }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const adminToken = req.headers.get("x-admin-token");
  if (!adminToken || !(await verifyAdminToken(adminToken))) {
    return new Response(
      JSON.stringify({ success: false, error: "unauthorized", requestId }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "analytics_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
