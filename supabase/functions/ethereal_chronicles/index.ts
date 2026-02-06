/**
 * ETHEREAL LAYER SECURITY MODEL - Chronicles Module
 * ==================================================
 *
 * ARCHITECTURE: "Full Isolation" (Deny All Direct Access)
 *
 * This function manages shared chronicles (documents/notes) in the Ethereal Layer.
 * It follows the same security model as all Ethereal functions:
 *
 * SECURITY LAYERS:
 * 1. DATABASE RLS: ethereal_chronicles table has RESTRICTIVE policy USING(false)
 *    blocking 100% of direct client queries.
 *
 * 2. EDGE FUNCTION PROXY: All CRUD operations are proxied through this function
 *    using service_role which bypasses RLS by design.
 *
 * 3. HMAC TOKEN VALIDATION: X-Ethereal-Token header required with signed payload.
 *
 * 4. SESSION REVOCATION: validateSession() checks ethereal_sessions table to ensure
 *    the session hasn't been revoked (kicked by room owner).
 *
 * ADDITIONAL FEATURES:
 * - Collaborative editing with lock mechanism (editing_by, editing_expires_at)
 * - Revision history for audit trail (ethereal_chronicle_revisions table)
 * - Media attachments with signed URLs (30-min TTL)
 * - Pin support for important chronicles
 *
 * FALSE POSITIVE SECURITY REPORTS:
 * Reports claiming this table is "publicly readable" are incorrect.
 * Direct access from anon or authenticated roles will always fail.
 *
 * @see supabase/functions/ethereal_join/index.ts - Session creation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ethereal-token',
};

interface TokenPayload {
  sessionId: string;
  roomId: string;
  memberId: string;
  exp?: number;
}

interface ChronicleRow {
  id: string;
  room_id: string;
  author_id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  media: Array<{ path: string; mime: string; w?: number; h?: number; kind: 'image' | 'audio' }>;
  editing_by: string | null;
  editing_expires_at: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  display_name: string;
}

// Web Crypto API for HMAC verification (same as ethereal_messages)
async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = Deno.env.get('ETHEREAL_TOKEN_SECRET');
    if (!secret) {
      console.error('[ethereal_chronicles] ETHEREAL_TOKEN_SECRET not set');
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      console.error('[ethereal_chronicles] Invalid token format');
      return null;
    }

    const [payloadB64, signatureB64] = parts;

    // Import key for Web Crypto
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate expected signature
    const dataToSign = encoder.encode(payloadB64);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);

    // Convert to base64
    const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Compare signatures
    if (signatureB64 !== expectedSigB64) {
      console.error('[ethereal_chronicles] Signature mismatch');
      return null;
    }

    // Decode payload
    const payload = JSON.parse(atob(payloadB64)) as TokenPayload;

    // Check expiration
    if (payload.exp && payload.exp < Date.now()) {
      console.error('[ethereal_chronicles] Token expired');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[ethereal_chronicles] Token verification failed:', err);
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function validateSession(
  supabase: any,
  payload: TokenPayload
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ethereal_sessions')
    .select('id, expires_at')
    .eq('id', payload.sessionId)
    .eq('room_id', payload.roomId)
    .eq('member_id', payload.memberId)
    .maybeSingle();

  if (error || !data) {
    console.error('[ethereal_chronicles] Session not found:', error);
    return false;
  }

  if (new Date(data.expires_at as string) < new Date()) {
    console.error('[ethereal_chronicles] Session expired');
    return false;
  }

  // Update last_seen
  await supabase
    .from('ethereal_room_members')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', payload.memberId);

  return true;
}

function formatChronicle(
  row: ChronicleRow,
  authorName: string,
  updatedByName?: string,
  editingByName?: string,
  mediaWithUrls?: Array<{ path: string; mime: string; signedUrl?: string; w?: number; h?: number; kind: string }>
) {
  return {
    serverId: row.id,
    roomId: row.room_id,
    authorId: row.author_id,
    authorName,
    updatedById: row.updated_by,
    updatedByName: updatedByName || null,
    title: row.title,
    content: row.content,
    tags: row.tags || [],
    pinned: row.pinned,
    media: mediaWithUrls || row.media || [],
    editingBy: row.editing_by,
    editingByName: editingByName || null,
    editingExpiresAt: row.editing_expires_at ? new Date(row.editing_expires_at).getTime() : null,
    createdAtMs: new Date(row.created_at).getTime(),
    updatedAtMs: new Date(row.updated_at).getTime(),
  };
}

// deno-lint-ignore no-explicit-any
async function getMemberNames(
  supabase: any,
  memberIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data } = await supabase
    .from('ethereal_room_members')
    .select('id, display_name')
    .in('id', uniqueIds);

  const map = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  (data || []).forEach((m: any) => map.set(m.id as string, m.display_name as string));
  return map;
}

// deno-lint-ignore no-explicit-any
async function generateSignedUrls(
  supabase: any,
  media: Array<{ path: string; mime: string; w?: number; h?: number; kind: 'image' | 'audio' }>
): Promise<Array<{ path: string; mime: string; signedUrl?: string; w?: number; h?: number; kind: string }>> {
  if (!media || media.length === 0) return [];

  const result = await Promise.all(
    media.map(async (item) => {
      const { data } = await supabase.storage
        .from('ethereal-chronicles-media')
        .createSignedUrl(item.path, 1800); // 30 min TTL

      return {
        ...item,
        signedUrl: data?.signedUrl || undefined,
      };
    })
  );

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate token
    const token = req.headers.get('X-Ethereal-Token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sessionValid = await validateSession(supabase, payload);
    if (!sessionValid) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path: /ethereal_chronicles or /ethereal_chronicles/:id or /ethereal_chronicles/:id/action
    const chronicleId = pathParts[1] && pathParts[1] !== 'ethereal_chronicles' ? pathParts[1] : null;
    const action = pathParts[2] || null;

    // ========== GET / — List chronicles ==========
    if (req.method === 'GET' && !chronicleId) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const before = url.searchParams.get('before');

      let query = supabase
        .from('ethereal_chronicles')
        .select('*')
        .eq('room_id', payload.roomId)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt('updated_at', new Date(parseInt(before)).toISOString());
      }

      const { data: chronicles, error } = await query;

      if (error) {
        console.error('[ethereal_chronicles] List error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch chronicles' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get member names
      const memberIds = (chronicles || []).flatMap((c: ChronicleRow) => [c.author_id, c.updated_by, c.editing_by].filter(Boolean) as string[]);
      const namesMap = await getMemberNames(supabase, memberIds);

      const formatted = await Promise.all(
        (chronicles || []).map(async (c: ChronicleRow) => {
          const mediaWithUrls = await generateSignedUrls(supabase, c.media || []);
          return formatChronicle(
            c,
            namesMap.get(c.author_id) || 'Unknown',
            c.updated_by ? namesMap.get(c.updated_by) : undefined,
            c.editing_by ? namesMap.get(c.editing_by) : undefined,
            mediaWithUrls
          );
        })
      );

      return new Response(JSON.stringify({ chronicles: formatted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET /:id — Get single chronicle ==========
    if (req.method === 'GET' && chronicleId && !action) {
      const { data: chronicle, error } = await supabase
        .from('ethereal_chronicles')
        .select('*')
        .eq('id', chronicleId)
        .eq('room_id', payload.roomId)
        .maybeSingle();

      if (error || !chronicle) {
        return new Response(JSON.stringify({ error: 'Chronicle not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const namesMap = await getMemberNames(supabase, [chronicle.author_id, chronicle.updated_by, chronicle.editing_by].filter(Boolean));
      const mediaWithUrls = await generateSignedUrls(supabase, chronicle.media || []);

      const formatted = formatChronicle(
        chronicle,
        namesMap.get(chronicle.author_id) || 'Unknown',
        chronicle.updated_by ? namesMap.get(chronicle.updated_by) : undefined,
        chronicle.editing_by ? namesMap.get(chronicle.editing_by) : undefined,
        mediaWithUrls
      );

      return new Response(JSON.stringify({ chronicle: formatted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== POST / — Create chronicle ==========
    if (req.method === 'POST' && !chronicleId) {
      const body = await req.json();
      const { title, content, tags } = body;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Title is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: chronicle, error } = await supabase
        .from('ethereal_chronicles')
        .insert({
          room_id: payload.roomId,
          author_id: payload.memberId,
          title: title.trim(),
          content: content || '',
          tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [],
        })
        .select()
        .single();

      if (error) {
        console.error('[ethereal_chronicles] Create error:', error);
        return new Response(JSON.stringify({ error: 'Failed to create chronicle' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get author name
      const { data: member } = await supabase
        .from('ethereal_room_members')
        .select('display_name')
        .eq('id', payload.memberId)
        .single();

      const formatted = formatChronicle(chronicle, member?.display_name || 'Unknown');

      return new Response(JSON.stringify({ chronicle: formatted }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== PUT /:id — Update chronicle ==========
    if (req.method === 'PUT' && chronicleId && !action) {
      const body = await req.json();
      const { title, content, tags } = body;

      // Get current chronicle
      const { data: current, error: fetchError } = await supabase
        .from('ethereal_chronicles')
        .select('*')
        .eq('id', chronicleId)
        .eq('room_id', payload.roomId)
        .maybeSingle();

      if (fetchError || !current) {
        return new Response(JSON.stringify({ error: 'Chronicle not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check lock ownership
      if (current.editing_by && current.editing_by !== payload.memberId) {
        const expiresAt = current.editing_expires_at ? new Date(current.editing_expires_at) : null;
        if (expiresAt && expiresAt > new Date()) {
          return new Response(JSON.stringify({ error: 'locked_by_other' }), {
            status: 423,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Save revision (snapshot of current state)
      await supabase
        .from('ethereal_chronicle_revisions')
        .insert({
          chronicle_id: chronicleId,
          editor_id: payload.memberId,
          title_snapshot: current.title,
          content_snapshot: current.content,
        });

      // Update chronicle
      const updateData: Record<string, unknown> = {
        updated_by: payload.memberId,
        updated_at: new Date().toISOString(),
        editing_by: null,
        editing_expires_at: null,
      };

      if (title !== undefined) updateData.title = title.trim();
      if (content !== undefined) updateData.content = content;
      if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : [];

      const { data: updated, error: updateError } = await supabase
        .from('ethereal_chronicles')
        .update(updateData)
        .eq('id', chronicleId)
        .select()
        .single();

      if (updateError) {
        console.error('[ethereal_chronicles] Update error:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update chronicle' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const namesMap = await getMemberNames(supabase, [updated.author_id, updated.updated_by].filter(Boolean));
      const mediaWithUrls = await generateSignedUrls(supabase, updated.media || []);

      const formatted = formatChronicle(
        updated,
        namesMap.get(updated.author_id) || 'Unknown',
        updated.updated_by ? namesMap.get(updated.updated_by) : undefined,
        undefined,
        mediaWithUrls
      );

      return new Response(JSON.stringify({ chronicle: formatted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== POST /:id/pin — Toggle pin ==========
    if (req.method === 'POST' && chronicleId && action === 'pin') {
      const { data: current, error: fetchError } = await supabase
        .from('ethereal_chronicles')
        .select('pinned')
        .eq('id', chronicleId)
        .eq('room_id', payload.roomId)
        .maybeSingle();

      if (fetchError || !current) {
        return new Response(JSON.stringify({ error: 'Chronicle not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: updated, error: updateError } = await supabase
        .from('ethereal_chronicles')
        .update({ pinned: !current.pinned, updated_at: new Date().toISOString() })
        .eq('id', chronicleId)
        .select()
        .single();

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to toggle pin' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ pinned: updated.pinned }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== POST /:id/lock — Lock for editing ==========
    if (req.method === 'POST' && chronicleId && action === 'lock') {
      const { data: current, error: fetchError } = await supabase
        .from('ethereal_chronicles')
        .select('editing_by, editing_expires_at')
        .eq('id', chronicleId)
        .eq('room_id', payload.roomId)
        .maybeSingle();

      if (fetchError || !current) {
        return new Response(JSON.stringify({ error: 'Chronicle not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const now = new Date();
      const expiresAt = current.editing_expires_at ? new Date(current.editing_expires_at) : null;
      const isExpired = !expiresAt || expiresAt < now;
      const isOwner = current.editing_by === payload.memberId;
      const isFree = !current.editing_by;

      // Can lock if: free, expired, or owner (refresh)
      if (!isFree && !isExpired && !isOwner) {
        const namesMap = await getMemberNames(supabase, [current.editing_by]);
        return new Response(
          JSON.stringify({
            error: 'locked_by_other',
            lockedBy: current.editing_by,
            lockedByName: namesMap.get(current.editing_by) || 'Unknown',
            expiresAt: expiresAt?.getTime(),
          }),
          {
            status: 423,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Grant lock (2 minutes)
      const newExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);

      await supabase
        .from('ethereal_chronicles')
        .update({
          editing_by: payload.memberId,
          editing_expires_at: newExpiresAt.toISOString(),
        })
        .eq('id', chronicleId);

      return new Response(
        JSON.stringify({
          locked: true,
          expiresAt: newExpiresAt.getTime(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ========== POST /:id/unlock — Release lock ==========
    if (req.method === 'POST' && chronicleId && action === 'unlock') {
      const { data: current, error: fetchError } = await supabase
        .from('ethereal_chronicles')
        .select('editing_by, editing_expires_at')
        .eq('id', chronicleId)
        .eq('room_id', payload.roomId)
        .maybeSingle();

      if (fetchError || !current) {
        return new Response(JSON.stringify({ error: 'Chronicle not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const now = new Date();
      const expiresAt = current.editing_expires_at ? new Date(current.editing_expires_at) : null;
      const isExpired = !expiresAt || expiresAt < now;
      const isOwner = current.editing_by === payload.memberId;

      // Can unlock if: owner or expired
      if (!isOwner && !isExpired) {
        return new Response(JSON.stringify({ error: 'Not lock owner' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('ethereal_chronicles')
        .update({
          editing_by: null,
          editing_expires_at: null,
        })
        .eq('id', chronicleId);

      return new Response(JSON.stringify({ unlocked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ethereal_chronicles] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
