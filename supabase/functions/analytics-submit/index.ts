import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AnalyticsPayload {
  date: string;
  sessionId: string;
  appVersion: string;
  deviceInfo?: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
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
    const body: AnalyticsPayload = await req.json();

    // Validate required fields
    if (!body.date || !body.sessionId || !body.metrics) {
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate date format
    const dateMatch = body.date.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!dateMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_date_format", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ 
      requestId, 
      action: "analytics_received",
      date: body.date,
      sessionId: body.sessionId.slice(0, 8),
      version: body.appVersion,
    });

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if we already have data for this session today
    const { data: existing } = await supabase
      .from("usage_analytics")
      .select("id, metrics")
      .eq("date", body.date)
      .eq("session_id", body.sessionId)
      .maybeSingle();

    if (existing) {
      // Merge metrics (take max values for counters)
      const mergedMetrics: Record<string, unknown> = { ...existing.metrics };
      
      for (const [key, value] of Object.entries(body.metrics)) {
        if (typeof value === 'number' && typeof mergedMetrics[key] === 'number') {
          mergedMetrics[key] = Math.max(value, mergedMetrics[key] as number);
        } else if (Array.isArray(value)) {
          // Merge arrays (e.g., pagesVisited)
          const existingArray = mergedMetrics[key] as unknown[] || [];
          mergedMetrics[key] = [...new Set([...existingArray, ...value])];
        } else {
          mergedMetrics[key] = value;
        }
      }

      const { error: updateError } = await supabase
        .from("usage_analytics")
        .update({
          metrics: mergedMetrics,
          device_info: body.deviceInfo || {},
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error({ requestId, action: "analytics_update_error", error: updateError.message });
        return new Response(
          JSON.stringify({ success: false, error: "database_error", requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log({ requestId, action: "analytics_updated" });
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from("usage_analytics")
        .insert({
          date: body.date,
          session_id: body.sessionId,
          app_version: body.appVersion,
          device_info: body.deviceInfo || {},
          metrics: body.metrics,
        });

      if (insertError) {
        console.error({ requestId, action: "analytics_insert_error", error: insertError.message });
        return new Response(
          JSON.stringify({ success: false, error: "database_error", requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log({ requestId, action: "analytics_inserted" });
    }

    return new Response(
      JSON.stringify({ success: true, requestId }),
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
