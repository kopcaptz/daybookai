import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (req.method !== "POST") {
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
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validStatuses = ["new", "investigating", "resolved", "ignored"];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ success: false, error: "invalid_status", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("crash_reports")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error({ requestId, action: "crash_update_error", error: error.message });
      return new Response(
        JSON.stringify({ success: false, error: "database_error", requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, action: "crash_updated", id, status });

    return new Response(
      JSON.stringify({ success: true, requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "crash_update_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
