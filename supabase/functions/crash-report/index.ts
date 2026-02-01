import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CrashReport {
  message: string;
  stack: string | null;
  componentStack?: string;
  url: string;
  appVersion: string;
  buildTimestamp?: string;
  timestamp: number;
  sessionId: string;
  deviceInfo?: Record<string, unknown>;
  breadcrumbs: string[];
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
    const body = await req.json();
    const reports: CrashReport[] = body.reports || [];

    if (!reports.length) {
      return new Response(
        JSON.stringify({ success: false, error: "no_reports", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, action: "crash_reports_received", count: reports.length });

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let inserted = 0;
    let updated = 0;

    for (const report of reports) {
      // Create a hash of the stack trace for deduplication
      const stackHash = report.stack 
        ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(report.stack))
            .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32))
        : null;

      // Check if we already have this error (by stack hash)
      if (stackHash) {
        const { data: existing } = await supabase
          .from("crash_reports")
          .select("id, occurrence_count")
          .eq("stack", report.stack)
          .eq("status", "new")
          .order("last_seen_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          // Update existing error
          const { error: updateError } = await supabase
            .from("crash_reports")
            .update({
              occurrence_count: existing.occurrence_count + 1,
              last_seen_at: new Date().toISOString(),
              // Update device_info and breadcrumbs with latest
              device_info: report.deviceInfo || {},
              breadcrumbs: report.breadcrumbs,
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error({ requestId, action: "crash_update_error", error: updateError.message });
          } else {
            updated++;
          }
          continue;
        }
      }

      // Insert new error
      const { error: insertError } = await supabase
        .from("crash_reports")
        .insert({
          message: report.message.slice(0, 1000), // Limit message length
          stack: report.stack?.slice(0, 10000), // Limit stack length
          component_stack: report.componentStack?.slice(0, 5000),
          url: report.url,
          app_version: report.appVersion,
          session_id: report.sessionId,
          device_info: report.deviceInfo || {},
          breadcrumbs: report.breadcrumbs,
          status: "new",
        });

      if (insertError) {
        console.error({ requestId, action: "crash_insert_error", error: insertError.message });
      } else {
        inserted++;
      }
    }

    console.log({ requestId, action: "crash_reports_processed", inserted, updated });

    return new Response(
      JSON.stringify({ success: true, requestId, inserted, updated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "crash_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
