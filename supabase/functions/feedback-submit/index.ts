import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const formData = await req.formData();
    const message = formData.get("message") as string;
    const image = formData.get("image") as File | null;
    const deviceInfoStr = formData.get("device_info") as string;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "message_required", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse device info
    let deviceInfo = {};
    if (deviceInfoStr) {
      try {
        deviceInfo = JSON.parse(deviceInfoStr);
      } catch {
        // Ignore parsing errors
      }
    }

    // Validate image size (max 5MB)
    if (image && image.size > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: "image_too_large", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let imageUrl: string | null = null;

    // Upload image if provided
    if (image) {
      const ext = image.name.split(".").pop() || "jpg";
      const fileName = `${requestId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("feedback-attachments")
        .upload(fileName, image, {
          contentType: image.type,
          upsert: false,
        });

      if (uploadError) {
        console.error({ requestId, action: "image_upload_error", error: uploadError.message });
        return new Response(
          JSON.stringify({ success: false, error: "image_upload_failed", requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Store just the file name, we'll generate signed URLs when needed
      imageUrl = fileName;
    }

    // Insert feedback into database
    const { error: insertError } = await supabase.from("feedback").insert({
      message: message.trim(),
      image_url: imageUrl,
      device_info: deviceInfo,
      status: "new",
    });

    if (insertError) {
      console.error({ requestId, action: "feedback_insert_error", error: insertError.message });
      return new Response(
        JSON.stringify({ success: false, error: "database_error", requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, action: "feedback_submitted", hasImage: !!imageUrl });

    return new Response(
      JSON.stringify({ success: true, requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error({ requestId, action: "feedback_error", error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: "server_error", requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
