import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ethereal-token',
};

// ============ Token Verification (same pattern as other ethereal functions) ============

interface TokenPayload {
  sessionId: string;
  memberId: string;
  roomId: string;
  exp: number;
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  const secret = Deno.env.get('ETHEREAL_TOKEN_SECRET');
  if (!secret) {
    console.error('[ethereal_tasks] ETHEREAL_TOKEN_SECRET not set');
    return null;
  }

  try {
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return null;

    // Decode payload
    const payloadJson = atob(payloadB64);
    const payload = JSON.parse(payloadJson) as TokenPayload;

    // Check expiration
    if (payload.exp < Date.now()) {
      console.log('[ethereal_tasks] Token expired');
      return null;
    }

    // Verify signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const expectedSignature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payloadB64)
    );

    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSignature)));

    if (signatureB64 !== expectedB64) {
      console.log('[ethereal_tasks] Signature mismatch');
      return null;
    }

    return payload;
  } catch (e) {
    console.error('[ethereal_tasks] Token verification failed:', e);
    return null;
  }
}

// Validate session exists in database (for kick support)
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
    console.log('[ethereal_tasks] Session not found or revoked');
    return false;
  }

  if (new Date(data.expires_at as string) < new Date()) {
    console.log('[ethereal_tasks] Session expired in DB');
    return false;
  }

  return true;
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const token = req.headers.get('x-ethereal-token');
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

  // Create Supabase client with service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Validate session exists in database (for kick/revoke support)
  const sessionValid = await validateSession(supabase, payload);
  if (!sessionValid) {
    return new Response(JSON.stringify({ error: 'Session revoked' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { roomId, memberId } = payload;

  // Parse URL for routing
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts: ['ethereal_tasks'] or ['ethereal_tasks', 'uuid'] or ['ethereal_tasks', 'uuid', 'toggle']
  const taskId = pathParts[1];
  const action = pathParts[2]; // 'toggle' or undefined

  try {
    // ============ GET /ethereal_tasks ============
    if (req.method === 'GET' && !taskId) {
      const includeDone = url.searchParams.get('includeDone') === 'true';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '80'), 200);

      let query = supabase
        .from('ethereal_tasks')
        .select(`
          id,
          room_id,
          creator_id,
          assignee_id,
          title,
          description,
          status,
          priority,
          due_at,
          completed_at,
          completed_by,
          created_at,
          updated_at,
          creator:ethereal_room_members!ethereal_tasks_creator_id_fkey(display_name),
          assignee:ethereal_room_members!ethereal_tasks_assignee_id_fkey(display_name),
          completer:ethereal_room_members!ethereal_tasks_completed_by_fkey(display_name)
        `)
        .eq('room_id', roomId)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (!includeDone) {
        query = query.neq('status', 'done');
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ethereal_tasks] GET error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Transform to client format
      const tasks = (data || []).map((t: any) => ({
        serverId: t.id,
        roomId: t.room_id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority || 'normal',
        dueAtMs: t.due_at ? new Date(t.due_at).getTime() : null,
        creatorId: t.creator_id,
        creatorName: t.creator?.display_name || 'Unknown',
        assigneeId: t.assignee_id,
        assigneeName: t.assignee?.display_name || null,
        completedAtMs: t.completed_at ? new Date(t.completed_at).getTime() : null,
        completedByName: t.completer?.display_name || null,
        createdAtMs: new Date(t.created_at).getTime(),
        updatedAtMs: new Date(t.updated_at).getTime(),
      }));

      return new Response(JSON.stringify({ success: true, tasks }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ POST /ethereal_tasks (create) ============
    if (req.method === 'POST' && !taskId) {
      const body = await req.json();
      const { title, description, assigneeId, dueAt, priority } = body;

      if (!title?.trim()) {
        return new Response(JSON.stringify({ error: 'Title required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const insertData: any = {
        room_id: roomId,
        creator_id: memberId,
        title: title.trim(),
        description: description?.trim() || null,
        assignee_id: assigneeId || null,
        due_at: dueAt || null,
        priority: priority === 'urgent' ? 'urgent' : 'normal',
        status: 'todo',
      };

      const { data, error } = await supabase
        .from('ethereal_tasks')
        .insert(insertData)
        .select(`
          id,
          room_id,
          creator_id,
          assignee_id,
          title,
          description,
          status,
          priority,
          due_at,
          created_at,
          updated_at,
          creator:ethereal_room_members!ethereal_tasks_creator_id_fkey(display_name),
          assignee:ethereal_room_members!ethereal_tasks_assignee_id_fkey(display_name)
        `)
        .single();

      if (error) {
        console.error('[ethereal_tasks] POST error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const task = {
        serverId: data.id,
        roomId: data.room_id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueAtMs: data.due_at ? new Date(data.due_at).getTime() : null,
        creatorId: data.creator_id,
        creatorName: (data.creator as any)?.[0]?.display_name || (data.creator as any)?.display_name || 'Unknown',
        assigneeId: data.assignee_id,
        assigneeName: (data.assignee as any)?.[0]?.display_name || (data.assignee as any)?.display_name || null,
        completedAtMs: null,
        completedByName: null,
        createdAtMs: new Date(data.created_at).getTime(),
        updatedAtMs: new Date(data.updated_at).getTime(),
      };

      console.log('[ethereal_tasks] Created:', task.serverId);
      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ PUT /ethereal_tasks/:id (update) ============
    if (req.method === 'PUT' && taskId && !action) {
      const body = await req.json();
      const { title, description, assigneeId, dueAt, priority } = body;

      // Verify task belongs to room
      const { data: existing } = await supabase
        .from('ethereal_tasks')
        .select('id')
        .eq('id', taskId)
        .eq('room_id', roomId)
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (assigneeId !== undefined) updateData.assignee_id = assigneeId || null;
      if (dueAt !== undefined) updateData.due_at = dueAt || null;
      if (priority !== undefined) updateData.priority = priority === 'urgent' ? 'urgent' : 'normal';

      const { data, error } = await supabase
        .from('ethereal_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select(`
          id,
          room_id,
          creator_id,
          assignee_id,
          title,
          description,
          status,
          priority,
          due_at,
          completed_at,
          completed_by,
          created_at,
          updated_at,
          creator:ethereal_room_members!ethereal_tasks_creator_id_fkey(display_name),
          assignee:ethereal_room_members!ethereal_tasks_assignee_id_fkey(display_name),
          completer:ethereal_room_members!ethereal_tasks_completed_by_fkey(display_name)
        `)
        .single();

      if (error) {
        console.error('[ethereal_tasks] PUT error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const task = {
        serverId: data.id,
        roomId: data.room_id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueAtMs: data.due_at ? new Date(data.due_at).getTime() : null,
        creatorId: data.creator_id,
        creatorName: (data.creator as any)?.[0]?.display_name || (data.creator as any)?.display_name || 'Unknown',
        assigneeId: data.assignee_id,
        assigneeName: (data.assignee as any)?.[0]?.display_name || (data.assignee as any)?.display_name || null,
        completedAtMs: data.completed_at ? new Date(data.completed_at).getTime() : null,
        completedByName: (data.completer as any)?.[0]?.display_name || (data.completer as any)?.display_name || null,
        createdAtMs: new Date(data.created_at).getTime(),
        updatedAtMs: new Date(data.updated_at).getTime(),
      };

      console.log('[ethereal_tasks] Updated:', task.serverId);
      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ POST /ethereal_tasks/:id/toggle ============
    if (req.method === 'POST' && taskId && action === 'toggle') {
      // Get current status
      const { data: existing, error: fetchError } = await supabase
        .from('ethereal_tasks')
        .select('status')
        .eq('id', taskId)
        .eq('room_id', roomId)
        .maybeSingle();

      if (fetchError || !existing) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newStatus = existing.status === 'done' ? 'todo' : 'done';
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'done') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = memberId;
      } else {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { data, error } = await supabase
        .from('ethereal_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select(`
          id,
          room_id,
          creator_id,
          assignee_id,
          title,
          description,
          status,
          priority,
          due_at,
          completed_at,
          completed_by,
          created_at,
          updated_at,
          creator:ethereal_room_members!ethereal_tasks_creator_id_fkey(display_name),
          assignee:ethereal_room_members!ethereal_tasks_assignee_id_fkey(display_name),
          completer:ethereal_room_members!ethereal_tasks_completed_by_fkey(display_name)
        `)
        .single();

      if (error) {
        console.error('[ethereal_tasks] toggle error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const task = {
        serverId: data.id,
        roomId: data.room_id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueAtMs: data.due_at ? new Date(data.due_at).getTime() : null,
        creatorId: data.creator_id,
        creatorName: (data.creator as any)?.[0]?.display_name || (data.creator as any)?.display_name || 'Unknown',
        assigneeId: data.assignee_id,
        assigneeName: (data.assignee as any)?.[0]?.display_name || (data.assignee as any)?.display_name || null,
        completedAtMs: data.completed_at ? new Date(data.completed_at).getTime() : null,
        completedByName: (data.completer as any)?.[0]?.display_name || (data.completer as any)?.display_name || null,
        createdAtMs: new Date(data.created_at).getTime(),
        updatedAtMs: new Date(data.updated_at).getTime(),
      };

      console.log('[ethereal_tasks] Toggled:', task.serverId, '->', task.status);
      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ DELETE /ethereal_tasks/:id ============
    if (req.method === 'DELETE' && taskId) {
      // Verify task belongs to room
      const { data: existing } = await supabase
        .from('ethereal_tasks')
        .select('id')
        .eq('id', taskId)
        .eq('room_id', roomId)
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('ethereal_tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        console.error('[ethereal_tasks] DELETE error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[ethereal_tasks] Deleted:', taskId);
      return new Response(JSON.stringify({ success: true, taskId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ Method Not Allowed ============
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[ethereal_tasks] Unhandled error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
