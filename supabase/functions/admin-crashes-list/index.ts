import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Verify admin token (same as other admin functions)
async function verifyAdminToken(token: string): Promise<boolean> {
  const adminPin = Deno.env.get("ADMIN_PIN");
  if (!adminPin) return false;
  
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return false;
    
    // Verify signature
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

  // Verify admin token
  const adminToken = req.headers.get("x-admin-token");
  if (!adminToken || !(await verifyAdminToken(adminToken))) {
    return new Response(
      JSON.stringify({ success: false, error: "unauthorized", requestId }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "new";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabase
      .from("crash_reports")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(100);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: crashes, error } = await query;

    if (error) {
      console.error({ requestId, action: "crashes_fetch_error", error: error.message });
      return new Response(
        JSON.stringify({ success: false, error: "database_error", requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, action: "crashes_fetched", count: crashes?.length || 0 });

    return new Response(
      JSON.stringify({ success: true, crashes: crashes || [], requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "crashes_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
