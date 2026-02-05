/**
 * Cleanup Revisions Edge Function
 * 
 * Automatically deletes chronicle revisions older than 30 days
 * while preserving the 3 most recent revisions per chronicle.
 * 
 * Triggered via cron job (daily at 03:00 UTC)
 * Authorization: Bearer CRON_SECRET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[cleanup-revisions] Request ${requestId} started`);

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (!cronSecret) {
      console.error(`[cleanup-revisions] CRON_SECRET not configured`);
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn(`[cleanup-revisions] Unauthorized request`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Calculate cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[cleanup-revisions] Cutoff date: ${cutoffISO}`);

    // Step 1: Get all chronicle IDs with their revision counts
    const { data: chronicles, error: chroniclesError } = await supabase
      .from('ethereal_chronicle_revisions')
      .select('chronicle_id')
      .order('chronicle_id');

    if (chroniclesError) {
      console.error(`[cleanup-revisions] Error fetching chronicles:`, chroniclesError);
      throw chroniclesError;
    }

    // Get unique chronicle IDs
    const uniqueChronicleIds = [...new Set(chronicles?.map(r => r.chronicle_id) || [])];
    console.log(`[cleanup-revisions] Found ${uniqueChronicleIds.length} chronicles with revisions`);

    let totalDeleted = 0;

    // Step 2: For each chronicle, keep the 3 most recent and delete old ones
    for (const chronicleId of uniqueChronicleIds) {
      // Get the 3 most recent revision IDs for this chronicle
      const { data: recentRevisions, error: recentError } = await supabase
        .from('ethereal_chronicle_revisions')
        .select('id')
        .eq('chronicle_id', chronicleId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentError) {
        console.error(`[cleanup-revisions] Error fetching recent revisions for ${chronicleId}:`, recentError);
        continue;
      }

      const keepIds = recentRevisions?.map(r => r.id) || [];

      // Delete revisions older than cutoff that are not in the "keep" list
      const { data: deleted, error: deleteError } = await supabase
        .from('ethereal_chronicle_revisions')
        .delete()
        .eq('chronicle_id', chronicleId)
        .lt('created_at', cutoffISO)
        .not('id', 'in', `(${keepIds.join(',')})`)
        .select('id');

      if (deleteError) {
        console.error(`[cleanup-revisions] Error deleting revisions for ${chronicleId}:`, deleteError);
        continue;
      }

      const deletedCount = deleted?.length || 0;
      if (deletedCount > 0) {
        totalDeleted += deletedCount;
        console.log(`[cleanup-revisions] Deleted ${deletedCount} revisions for chronicle ${chronicleId}`);
      }
    }

    console.log(`[cleanup-revisions] Completed. Total deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: totalDeleted,
        cutoff: cutoffISO,
        chroniclesProcessed: uniqueChronicleIds.length,
        requestId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      }
    );
  } catch (error) {
    console.error(`[cleanup-revisions] Error:`, error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      }
    );
  }
});
