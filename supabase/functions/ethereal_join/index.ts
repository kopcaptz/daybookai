import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JoinRequest {
  pin: string;
  deviceId: string;
  displayName: string;
}

interface TokenPayload {
  roomId: string;
  memberId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

// Generate 256-bit channel key (64 hex chars)
function generateChannelKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA256 hash for PIN
async function hashPin(salt: string, pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Create HMAC token with sessionId
async function createEtherealToken(
  secret: string,
  roomId: string,
  memberId: string,
  sessionId: string,
  ttlMs: number
): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + ttlMs;

  const payload: TokenPayload = {
    roomId,
    memberId,
    sessionId,
    iat: now,
    exp: expiresAt,
  };

  const payloadBase64 = btoa(JSON.stringify(payload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return {
    token: `${payloadBase64}.${signatureBase64}`,
    expiresAt,
  };
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

    const { pin, deviceId, displayName } = (await req.json()) as JoinRequest;

    if (!pin || !deviceId || !displayName) {
      return new Response(
        JSON.stringify({ success: false, error: "missing_fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate PIN format (min 8 chars for security)
    if (pin.length < 4) {
      return new Response(
        JSON.stringify({ success: false, error: "pin_too_short" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const salt = Deno.env.get("ETHEREAL_PIN_SALT");
    const tokenSecret = Deno.env.get("ETHEREAL_TOKEN_SECRET");

    if (!salt || !tokenSecret) {
      console.error("Missing secrets");
      return new Response(
        JSON.stringify({ success: false, error: "server_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the PIN
    const pinHash = await hashPin(salt, pin);

    // Find or create room
    let roomId: string;
    let isNewRoom = false;

    const { data: existingRoom } = await supabase
      .from("ethereal_rooms")
      .select("id")
      .eq("pin_hash", pinHash)
      .maybeSingle();

    if (existingRoom) {
      roomId = existingRoom.id;
    } else {
      // Create new room
      const { data: newRoom, error: createError } = await supabase
        .from("ethereal_rooms")
        .insert({ pin_hash: pinHash })
        .select("id")
        .single();

      if (createError) {
        // Could be a race condition - try to find the room again
        const { data: retryRoom } = await supabase
          .from("ethereal_rooms")
          .select("id")
          .eq("pin_hash", pinHash)
          .single();

        if (retryRoom) {
          roomId = retryRoom.id;
        } else {
          console.error("Room creation error:", createError);
          return new Response(
            JSON.stringify({ success: false, error: "room_error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        roomId = newRoom.id;
        isNewRoom = true;
      }
    }

    // Generate channel key (256-bit)
    const channelKey = generateChannelKey();

    // TTL: 7 days
    const ttlSeconds = 7 * 24 * 60 * 60;
    const ttlMs = ttlSeconds * 1000;

    // Call RPC to join room atomically
    const { data: joinResult, error: joinError } = await supabase.rpc(
      "ethereal_join_room",
      {
        p_room_id: roomId,
        p_device_id: deviceId,
        p_display_name: displayName,
        p_channel_key: channelKey,
        p_ttl_seconds: ttlSeconds,
      }
    );

    if (joinError) {
      if (joinError.message.includes("room_full")) {
        return new Response(
          JSON.stringify({ success: false, error: "room_full" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Join error:", joinError);
      return new Response(
        JSON.stringify({ success: false, error: "join_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = joinResult[0];
    if (!result) {
      return new Response(
        JSON.stringify({ success: false, error: "join_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create HMAC token with sessionId
    const { token, expiresAt } = await createEtherealToken(
      tokenSecret,
      roomId,
      result.member_id,
      result.session_id,
      ttlMs
    );

    console.log(`Join success: room=${roomId.slice(0, 8)}, member=${result.member_id.slice(0, 8)}, isNew=${result.is_new}`);

    return new Response(
      JSON.stringify({
        success: true,
        roomId,
        memberId: result.member_id,
        accessToken: token,
        channelKey,
        expiresAt,
        isOwner: result.is_owner,
        isNewRoom,
        memberCount: result.current_count,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
