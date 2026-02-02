import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ethereal-token",
};

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/webp", "image/png"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

function getExtensionFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/png": return "png";
    default: return "jpg";
  }
}

interface TokenPayload {
  roomId: string;
  memberId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

interface ValidatedSession {
  roomId: string;
  memberId: string;
  sessionId: string;
}

async function validateEtherealToken(
  req: Request,
  supabase: any
): Promise<{ valid: true; session: ValidatedSession } | { valid: false; error: string }> {
  const token = req.headers.get("X-Ethereal-Token");
  if (!token) return { valid: false, error: "missing_token" };

  const secret = Deno.env.get("ETHEREAL_TOKEN_SECRET");
  if (!secret) return { valid: false, error: "server_error" };

  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return { valid: false, error: "invalid_token" };

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(payloadB64));
    if (!valid) return { valid: false, error: "invalid_signature" };

    const payload: TokenPayload = JSON.parse(atob(payloadB64));
    if (Date.now() > payload.exp) return { valid: false, error: "token_expired" };

    // B.2: Verify sessionId exists in database (for real kick support)
    const { data: session, error } = await supabase
      .from("ethereal_sessions")
      .select("id, room_id, member_id, expires_at")
      .eq("id", payload.sessionId)
      .maybeSingle();

    if (error || !session) {
      return { valid: false, error: "session_revoked" };
    }

    if (new Date(session.expires_at) < new Date()) {
      return { valid: false, error: "session_expired" };
    }

    if (session.room_id !== payload.roomId || session.member_id !== payload.memberId) {
      return { valid: false, error: "session_mismatch" };
    }

    return {
      valid: true,
      session: {
        roomId: payload.roomId,
        memberId: payload.memberId,
        sessionId: payload.sessionId,
      },
    };
  } catch {
    return { valid: false, error: "invalid_token" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const validation = await validateEtherealToken(req, supabase);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { roomId, memberId } = validation.session;

    if (req.method === "POST") {
      // Parse FormData or JSON
      const contentType = req.headers.get("content-type") || "";
      let content = "";
      let imageFile: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await req.formData();
        content = (formData.get("content") ?? "").toString();
        const imageEntry = formData.get("image");
        if (imageEntry instanceof File) {
          imageFile = imageEntry;
        }
      } else {
        // Fallback to JSON for backward compatibility
        const json = await req.json();
        content = json.content || "";
      }

      // At least one of content or image required
      if (!content.trim() && !imageFile) {
        return new Response(
          JSON.stringify({ success: false, error: "empty_message" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate image if present
      if (imageFile) {
        if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
          return new Response(
            JSON.stringify({ success: false, error: "invalid_image_type" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (imageFile.size > MAX_IMAGE_SIZE) {
          return new Response(
            JSON.stringify({ success: false, error: "image_too_large" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Get sender's display name
      const { data: member } = await supabase
        .from("ethereal_room_members")
        .select("display_name")
        .eq("id", memberId)
        .single();

      // Insert message (content = '' if image-only, since column is NOT NULL)
      const { data: msg, error: insertError } = await supabase
        .from("ethereal_messages")
        .insert({
          room_id: roomId,
          sender_id: memberId,
          content: content.trim() || "",
        })
        .select("id, created_at")
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "insert_error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let imagePath: string | null = null;
      let imageUrl: string | null = null;

      // Upload image if present
      if (imageFile) {
        const ext = getExtensionFromMime(imageFile.type);
        imagePath = `${roomId}/${msg.id}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("ethereal-media")
          .upload(imagePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          // Message created but image failed - clean up message
          await supabase.from("ethereal_messages").delete().eq("id", msg.id);
          return new Response(
            JSON.stringify({ success: false, error: "upload_error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update message with image metadata
        const { error: updateError } = await supabase
          .from("ethereal_messages")
          .update({
            image_path: imagePath,
            image_mime: imageFile.type,
          })
          .eq("id", msg.id);

        if (updateError) {
          console.error("Update error:", updateError);

          // 1) Try remove file (best effort)
          try {
            await supabase.storage.from("ethereal-media").remove([imagePath]);
          } catch (e) {
            console.error("Cleanup remove file failed:", e);
          }

          // 2) Try delete message (best effort)
          const { error: delErr } = await supabase
            .from("ethereal_messages")
            .delete()
            .eq("id", msg.id);

          if (delErr) {
            console.error("Cleanup delete msg failed:", delErr);
            // 3) Fallback: mark message as failed so UI doesn't show ghost
            await supabase
              .from("ethereal_messages")
              .update({ content: "[image upload failed]" })
              .eq("id", msg.id);
          }

          return new Response(
            JSON.stringify({ success: false, error: "update_error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Generate signed URL for immediate use
        const { data: signedData } = await supabase.storage
          .from("ethereal-media")
          .createSignedUrl(imagePath, 1800); // 30 minutes

        imageUrl = signedData?.signedUrl || null;
      }

      return new Response(
        JSON.stringify({
          success: true,
          id: msg.id,
          createdAtMs: Date.parse(msg.created_at),
          senderName: member?.display_name || "Unknown",
          imagePath,
          imageUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET") {
      // List messages
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const before = url.searchParams.get("before");

      // B.7: Correct alias for foreign table + image fields
      let query = supabase
        .from("ethereal_messages")
        .select(`
          id,
          sender_id,
          content,
          created_at,
          image_path,
          image_mime,
          image_w,
          image_h,
          sender:ethereal_room_members!sender_id(display_name)
        `)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt("created_at", new Date(parseInt(before)).toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error("List error:", error);
        return new Response(
          JSON.stringify({ success: false, error: "list_error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate signed URLs for messages with images (parallel)
      const messagesWithUrls = await Promise.all(
        data.map(async (m: any) => {
          let imageUrl: string | null = null;
          if (m.image_path) {
            const { data: signedData } = await supabase.storage
              .from("ethereal-media")
              .createSignedUrl(m.image_path, 1800); // 30 minutes
            imageUrl = signedData?.signedUrl || null;
          }
          return {
            serverId: m.id,
            senderId: m.sender_id,
            senderName: m.sender?.display_name || "Unknown",
            content: m.content,
            createdAtMs: Date.parse(m.created_at),
            imagePath: m.image_path || null,
            imageUrl,
            imageMime: m.image_mime || null,
            imageW: m.image_w || null,
            imageH: m.image_h || null,
          };
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          messages: messagesWithUrls,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
