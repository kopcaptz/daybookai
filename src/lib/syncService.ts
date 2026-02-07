import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { db, type DiaryEntry, type Attachment } from './db';
import { logger } from './logger';

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncMeta {
  lastSyncedAt: string | null; // ISO timestamp
  pendingCount: number;
}

const SYNC_META_KEY = 'daybook-sync-meta';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Load sync metadata from localStorage
export function loadSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lastSyncedAt: null, pendingCount: 0 };
}

function saveSyncMeta(meta: Partial<SyncMeta>) {
  const current = loadSyncMeta();
  localStorage.setItem(SYNC_META_KEY, JSON.stringify({ ...current, ...meta }));
}

// Get current user id
async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Sync entries: bidirectional with Last-Write-Wins strategy
 */
export async function syncEntries(): Promise<{ uploaded: number; downloaded: number; errors: string[] }> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = { uploaded: 0, downloaded: 0, errors: [] as string[] };
  const meta = loadSyncMeta();

  try {
    // 1. Get all local entries
    const localEntries = await db.entries.toArray();

    // 2. Get server entries updated since last sync (or all if first sync)
    let query = supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId);

    if (meta.lastSyncedAt) {
      query = query.gte('updated_at', meta.lastSyncedAt);
    }

    const { data: serverEntries, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    // Build lookup maps
    const serverByLocalId = new Map<number, any>();
    (serverEntries || []).forEach(se => serverByLocalId.set(se.local_id, se));

    const localById = new Map<number, DiaryEntry>();
    localEntries.forEach(le => { if (le.id) localById.set(le.id, le); });

    // 3. Upload local entries that are newer or don't exist on server
    for (const local of localEntries) {
      if (!local.id) continue;

      // Skip private entries unless sync-private is enabled
      const syncPrivate = localStorage.getItem('daybook-sync-private') === 'true';
      if (local.isPrivate && !syncPrivate) continue;

      const server = serverByLocalId.get(local.id);

      if (!server) {
        // Entry doesn't exist on server — upload
        const upsertData = {
          user_id: userId,
          local_id: local.id,
          date: local.date,
          text: local.text,
          mood: local.mood,
          tags: local.tags,
          is_private: local.isPrivate,
          title: local.title || null,
          title_source: local.titleSource || null,
          mood_source: local.moodSource || 'user',
          semantic_tags: local.semanticTags || [],
          attachment_counts: (local.attachmentCounts || { image: 0, video: 0, audio: 0 }) as unknown as Json,
          created_at: new Date(local.createdAt).toISOString(),
          updated_at: new Date(local.updatedAt).toISOString(),
        };
        const { error } = await supabase.from('diary_entries').upsert(upsertData, { onConflict: 'user_id,local_id' });

        if (error) {
          result.errors.push(`Upload entry ${local.id}: ${error.message}`);
        } else {
          result.uploaded++;
        }
      } else {
        // Both exist — Last Write Wins
        const localTime = local.updatedAt;
        const serverTime = new Date(server.updated_at).getTime();

        if (localTime > serverTime) {
          // Local is newer — push to server
          const { error } = await supabase.from('diary_entries')
            .update({
              text: local.text,
              mood: local.mood,
              tags: local.tags,
              is_private: local.isPrivate,
              title: local.title || null,
              title_source: local.titleSource || null,
              mood_source: local.moodSource || 'user',
              semantic_tags: local.semanticTags || [],
              attachment_counts: (local.attachmentCounts || { image: 0, video: 0, audio: 0 }) as unknown as Json,
              updated_at: new Date(local.updatedAt).toISOString(),
            })
            .eq('id', server.id);

          if (error) {
            result.errors.push(`Update server entry ${local.id}: ${error.message}`);
          } else {
            result.uploaded++;
          }
        } else if (serverTime > localTime) {
          // Server is newer — pull to local
          await db.entries.update(local.id, {
            text: server.text,
            mood: server.mood,
            tags: server.tags,
            isPrivate: server.is_private,
            aiAllowed: !server.is_private,
            title: server.title,
            titleSource: server.title_source,
            moodSource: server.mood_source,
            semanticTags: server.semantic_tags || [],
            attachmentCounts: server.attachment_counts || { image: 0, video: 0, audio: 0 },
            updatedAt: serverTime,
          });
          result.downloaded++;
        }
        // Equal timestamps = no action needed
      }
    }

    // 4. Download server entries that don't exist locally
    for (const server of (serverEntries || [])) {
      if (server.deleted_at) continue; // Skip soft-deleted

      const localExists = localById.has(server.local_id);
      if (!localExists && !serverByLocalId.has(server.local_id)) {
        // This shouldn't happen normally (server has local_id that doesn't exist locally)
        // This means it was created on another device — create locally
        // Note: we can't easily assign the exact local_id, so we create a new entry
      }
    }

    // Also download entries from other devices (entries on server with local_ids not in our local DB)
    if (!meta.lastSyncedAt) {
      // First sync: get ALL server entries
      const { data: allServerEntries, error: allError } = await supabase
        .from('diary_entries')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (!allError && allServerEntries) {
        for (const se of allServerEntries) {
          const existsLocally = localById.has(se.local_id);
          if (!existsLocally) {
            // Entry from another device — create locally
            await db.entries.add({
              date: se.date,
              text: se.text,
              mood: se.mood,
              tags: se.tags || [],
              isPrivate: se.is_private,
              aiAllowed: !se.is_private,
              title: se.title,
              titleSource: se.title_source as 'ai' | 'user' | undefined,
              moodSource: se.mood_source as 'user' | 'ai' | undefined,
              semanticTags: se.semantic_tags || [],
              attachmentCounts: se.attachment_counts as any,
              createdAt: new Date(se.created_at).getTime(),
              updatedAt: new Date(se.updated_at).getTime(),
            });
            result.downloaded++;
          }
        }
      }
    }

    // 5. Update sync metadata
    saveSyncMeta({
      lastSyncedAt: new Date().toISOString(),
      pendingCount: 0,
    });

    logger.info('[Sync]', `Completed: ↑${result.uploaded} ↓${result.downloaded} errors=${result.errors.length}`);
  } catch (err: any) {
    result.errors.push(err.message || 'Unknown sync error');
    logger.error('[Sync] Failed', err);
  }

  return result;
}

/**
 * Sync attachments: upload local media to cloud storage
 */
export async function syncAttachments(): Promise<{ uploaded: number; errors: string[] }> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = { uploaded: 0, errors: [] as string[] };

  try {
    // Get all local attachments
    const localAttachments = await db.attachments.toArray();

    for (const att of localAttachments) {
      if (!att.id || !att.entryId) continue;

      // Check if already uploaded (by checking if diary_attachments record exists)
      const { data: existing } = await supabase
        .from('diary_attachments')
        .select('id')
        .eq('user_id', userId)
        .eq('local_entry_id', att.entryId)
        .eq('kind', att.kind)
        .eq('size', att.size)
        .maybeSingle();

      if (existing) continue; // Already synced

      // Upload blob to storage
      const storagePath = `${userId}/${att.entryId}/${att.id}_${att.kind}.${att.mimeType.split('/')[1] || 'bin'}`;

      const { error: uploadError } = await supabase.storage
        .from('diary-media')
        .upload(storagePath, att.blob, {
          contentType: att.mimeType,
          upsert: true,
        });

      if (uploadError) {
        result.errors.push(`Upload attachment ${att.id}: ${uploadError.message}`);
        continue;
      }

      // Get the entry's cloud id
      const { data: cloudEntry } = await supabase
        .from('diary_entries')
        .select('id')
        .eq('user_id', userId)
        .eq('local_id', att.entryId)
        .maybeSingle();

      // Upload thumbnail if exists
      let thumbnailPath: string | null = null;
      if (att.thumbnail) {
        thumbnailPath = `${userId}/${att.entryId}/${att.id}_thumb.jpg`;
        await supabase.storage
          .from('diary-media')
          .upload(thumbnailPath, att.thumbnail, {
            contentType: 'image/jpeg',
            upsert: true,
          });
      }

      // Create attachment record
      const { error: insertError } = await supabase
        .from('diary_attachments')
        .insert({
          user_id: userId,
          entry_id: cloudEntry?.id || null,
          local_entry_id: att.entryId,
          kind: att.kind,
          mime_type: att.mimeType,
          size: att.size,
          duration: att.duration || null,
          storage_path: storagePath,
          thumbnail_path: thumbnailPath,
        });

      if (insertError) {
        result.errors.push(`Record attachment ${att.id}: ${insertError.message}`);
      } else {
        result.uploaded++;
      }
    }
  } catch (err: any) {
    result.errors.push(err.message || 'Unknown attachment sync error');
  }

  return result;
}

/**
 * Full sync: entries + attachments
 */
export async function fullSync(): Promise<{
  entries: { uploaded: number; downloaded: number; errors: string[] };
  attachments: { uploaded: number; errors: string[] };
}> {
  const entries = await syncEntries();
  const attachments = await syncAttachments();
  return { entries, attachments };
}

/**
 * Migrate all existing local data to cloud (first-time upload)
 */
export async function migrateLegacyData(
  onProgress?: (current: number, total: number) => void
): Promise<{ entries: number; attachments: number; errors: string[] }> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = { entries: 0, attachments: 0, errors: [] as string[] };

  const allEntries = await db.entries.toArray();
  const syncPrivate = localStorage.getItem('daybook-sync-private') === 'true';
  const entriesToSync = syncPrivate ? allEntries : allEntries.filter(e => !e.isPrivate);
  const total = entriesToSync.length;

  for (let i = 0; i < entriesToSync.length; i++) {
    const entry = entriesToSync[i];
    if (!entry.id) continue;

    onProgress?.(i + 1, total);

    try {
      const upsertData = {
        user_id: userId,
        local_id: entry.id,
        date: entry.date,
        text: entry.text,
        mood: entry.mood,
        tags: entry.tags,
        is_private: entry.isPrivate,
        title: entry.title || null,
        title_source: entry.titleSource || null,
        mood_source: entry.moodSource || 'user',
        semantic_tags: entry.semanticTags || [],
        attachment_counts: (entry.attachmentCounts || { image: 0, video: 0, audio: 0 }) as unknown as Json,
        created_at: new Date(entry.createdAt).toISOString(),
        updated_at: new Date(entry.updatedAt).toISOString(),
      };
      const { error } = await supabase.from('diary_entries').upsert(upsertData, { onConflict: 'user_id,local_id' });

      if (error) {
        result.errors.push(`Entry ${entry.id}: ${error.message}`);
      } else {
        result.entries++;
      }
    } catch (err: any) {
      result.errors.push(`Entry ${entry.id}: ${err.message}`);
    }
  }

  // Sync attachments after entries
  const attResult = await syncAttachments();
  result.attachments = attResult.uploaded;
  result.errors.push(...attResult.errors);

  // Mark sync complete
  saveSyncMeta({
    lastSyncedAt: new Date().toISOString(),
    pendingCount: 0,
  });

  return result;
}

// Auto-sync manager
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  stopAutoSync();
  syncInterval = setInterval(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      await syncEntries();
    } catch {
      // Silent fail for auto-sync
    }
  }, SYNC_INTERVAL);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
