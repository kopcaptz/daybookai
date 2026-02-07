import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// CORS configuration - allow known origins
const ALLOWED_ORIGINS = [
  "https://local-heart-diary.lovable.app",
  "https://daybookai.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
];
const LOVABLE_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.lovable\.app$/;
const LOVABLE_PROJECT_PATTERN = /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (LOVABLE_PREVIEW_PATTERN.test(origin)) return true;
  if (LOVABLE_PROJECT_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface SyncChange {
  syncId: string;
  payload?: unknown | null;
  updatedAtMs: number;
  deletedAtMs?: number | null;
}

interface SyncRequest {
  since?: number | null;
  changes?: SyncChange[];
  deviceId?: string | null;
}

interface SyncResponse {
  success: boolean;
  serverTime: number;
  changes: SyncChange[];
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const syncKey = req.headers.get("x-sync-key")?.trim();
    if (!syncKey || syncKey.length < 12) {
      return new Response(JSON.stringify({ error: "sync_key_required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(`[${requestId}] Missing Supabase env`);
      return new Response(JSON.stringify({ error: "service_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: SyncRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changes = Array.isArray(body.changes) ? body.changes : [];
    const since = typeof body.since === "number" && body.since > 0 ? body.since : 0;

    const syncKeyHash = await sha256Hex(syncKey);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let accountId: string | null = null;
    const { data: account } = await supabase
      .from("cloud_sync_accounts")
      .select("id")
      .eq("key_hash", syncKeyHash)
      .maybeSingle();

    if (account?.id) {
      accountId = account.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("cloud_sync_accounts")
        .insert({ key_hash: syncKeyHash })
        .select("id")
        .single();

      if (createError) {
        // Retry read in case of race condition
        const { data: retryAccount } = await supabase
          .from("cloud_sync_accounts")
          .select("id")
          .eq("key_hash", syncKeyHash)
          .maybeSingle();
        accountId = retryAccount?.id ?? null;
      } else {
        accountId = created?.id ?? null;
      }
    }

    if (!accountId) {
      return new Response(JSON.stringify({ error: "account_init_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (changes.length > 0) {
      const syncIds = changes
        .map((change) => change?.syncId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      const existingMap = new Map<string, { updated_at_ms: number; deleted_at_ms: number | null; payload: unknown | null }>();
      if (syncIds.length > 0) {
        const { data: existingRows } = await supabase
          .from("cloud_sync_entries")
          .select("sync_id, updated_at_ms, deleted_at_ms, payload")
          .eq("account_id", accountId)
          .in("sync_id", syncIds);

        for (const row of existingRows ?? []) {
          existingMap.set(row.sync_id, {
            updated_at_ms: row.updated_at_ms,
            deleted_at_ms: row.deleted_at_ms,
            payload: row.payload ?? null,
          });
        }
      }

      const rowsToUpsert = [];
      for (const change of changes) {
        if (!change || typeof change.syncId !== "string" || typeof change.updatedAtMs !== "number") {
          continue;
        }

        const existing = existingMap.get(change.syncId);
        if (existing && existing.updated_at_ms >= change.updatedAtMs) {
          continue;
        }

        const deletedAtMs = typeof change.deletedAtMs === "number" ? change.deletedAtMs : null;
        const payload = deletedAtMs ? (change.payload ?? existing?.payload ?? null) : (change.payload ?? null);

        rowsToUpsert.push({
          account_id: accountId,
          sync_id: change.syncId,
          payload,
          updated_at_ms: change.updatedAtMs,
          deleted_at_ms: deletedAtMs,
        });
      }

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from("cloud_sync_entries")
          .upsert(rowsToUpsert, { onConflict: "account_id,sync_id" });
        if (upsertError) {
          console.error(`[${requestId}] Upsert error:`, upsertError);
          return new Response(JSON.stringify({ error: "upsert_failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { data: remoteRows, error: remoteError } = await supabase
      .from("cloud_sync_entries")
      .select("sync_id, payload, updated_at_ms, deleted_at_ms")
      .eq("account_id", accountId)
      .gt("updated_at_ms", since)
      .order("updated_at_ms", { ascending: true })
      .limit(2000);

    if (remoteError) {
      console.error(`[${requestId}] Fetch error:`, remoteError);
      return new Response(JSON.stringify({ error: "fetch_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response: SyncResponse = {
      success: true,
      serverTime: Date.now(),
      changes: (remoteRows ?? []).map((row) => ({
        syncId: row.sync_id,
        payload: row.payload ?? null,
        updatedAtMs: row.updated_at_ms,
        deletedAtMs: row.deleted_at_ms ?? null,
      })),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return new Response(JSON.stringify({ error: "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
