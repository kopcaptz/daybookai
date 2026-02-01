import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ethereal-token",
};

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

    if (req.method === "GET") {
      // List members
      const { data: members, error } = await supabase
        .from("ethereal_room_members")
        .select("id, display_name, joined_at, last_seen_at")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (error) {
        console.error("List members error:", error);
        return new Response(
          JSON.stringify({ success: false, error: "list_error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get owner info
      const { data: room } = await supabase
        .from("ethereal_rooms")
        .select("owner_member_id")
        .eq("id", roomId)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          members: members.map((m) => ({
            id: m.id,
            displayName: m.display_name,
            joinedAt: m.joined_at,
            lastSeenAt: m.last_seen_at,
            isOwner: m.id === room?.owner_member_id,
          })),
          currentMemberId: memberId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "DELETE") {
      // Kick member (owner only)
      const { memberId: targetMemberId } = await req.json();

      if (!targetMemberId) {
        return new Response(
          JSON.stringify({ success: false, error: "missing_member_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Can't kick yourself
      if (targetMemberId === memberId) {
        return new Response(
          JSON.stringify({ success: false, error: "cannot_kick_self" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if requester is owner
      const { data: room } = await supabase
        .from("ethereal_rooms")
        .select("owner_member_id")
        .eq("id", roomId)
        .single();

      if (room?.owner_member_id !== memberId) {
        return new Response(
          JSON.stringify({ success: false, error: "not_owner" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete member (CASCADE will delete sessions)
      const { error: deleteError } = await supabase
        .from("ethereal_room_members")
        .delete()
        .eq("id", targetMemberId)
        .eq("room_id", roomId);

      if (deleteError) {
        console.error("Delete member error:", deleteError);
        return new Response(
          JSON.stringify({ success: false, error: "delete_error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Member kicked: ${targetMemberId.slice(0, 8)} from room ${roomId.slice(0, 8)}`);

      return new Response(
        JSON.stringify({ success: true }),
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
