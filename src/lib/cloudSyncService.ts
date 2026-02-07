import { supabase } from '@/integrations/supabase/client';
import { db, getEntryBySyncId, getPendingEntryDeletes, clearEntryDeletes, type DiaryEntry } from '@/lib/db';

const SYNC_ENABLED_KEY = 'daybook-cloud-sync-enabled';
const SYNC_KEY_KEY = 'daybook-cloud-sync-key';
const SYNC_LAST_KEY = 'daybook-cloud-sync-last';
const SYNC_DEVICE_KEY = 'daybook-cloud-sync-device-id';

const MIN_SYNC_KEY_LENGTH = 12;

export interface CloudSyncResult {
  ok: boolean;
  reason?: string;
  pulled?: number;
  pushed?: number;
  deleted?: number;
  serverTime?: number;
}

interface CloudSyncChange {
  syncId: string;
  payload?: CloudEntryPayload | null;
  updatedAtMs: number;
  deletedAtMs?: number | null;
}

export interface CloudEntryPayload {
  date: string;
  text: string;
  mood: number;
  tags: string[];
  isPrivate: boolean;
  aiAllowed: boolean;
  createdAt: number;
  updatedAt: number;
  attachmentCounts?: DiaryEntry['attachmentCounts'];
  moodSource?: DiaryEntry['moodSource'];
  semanticTags?: DiaryEntry['semanticTags'];
  aiAnalyzedAt?: DiaryEntry['aiAnalyzedAt'];
  title?: DiaryEntry['title'];
  titleSource?: DiaryEntry['titleSource'];
}

function normalizeSyncKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatSyncKey(key: string): string {
  const normalized = normalizeSyncKey(key);
  const groups = normalized.match(/.{1,4}/g);
  return groups ? groups.join('-') : normalized;
}

export function isCloudSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

export function setCloudSyncEnabled(enabled: boolean): void {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function getCloudSyncKey(): string | null {
  const raw = localStorage.getItem(SYNC_KEY_KEY);
  return raw ? normalizeSyncKey(raw) : null;
}

export function setCloudSyncKey(key: string): void {
  localStorage.setItem(SYNC_KEY_KEY, normalizeSyncKey(key));
}

export function generateCloudSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return formatSyncKey(hex);
}

export function getLastCloudSyncAt(): number | null {
  const raw = localStorage.getItem(SYNC_LAST_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setLastCloudSyncAt(timestamp: number): void {
  localStorage.setItem(SYNC_LAST_KEY, String(timestamp));
}

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(SYNC_DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(SYNC_DEVICE_KEY, deviceId);
  }
  return deviceId;
}

async function ensureEntrySyncIds(): Promise<void> {
  await db.entries.toCollection().modify((entry) => {
    if (!entry.syncId) {
      entry.syncId = crypto.randomUUID();
    }
    if (entry.syncUpdatedAt === undefined) {
      entry.syncUpdatedAt = 0;
    }
  });
}

function toPayload(entry: DiaryEntry): CloudEntryPayload {
  return {
    date: entry.date,
    text: entry.text,
    mood: entry.mood,
    tags: entry.tags ?? [],
    isPrivate: entry.isPrivate,
    aiAllowed: entry.aiAllowed ?? !entry.isPrivate,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    attachmentCounts: entry.attachmentCounts,
    moodSource: entry.moodSource,
    semanticTags: entry.semanticTags ?? [],
    aiAnalyzedAt: entry.aiAnalyzedAt,
    title: entry.title ?? null,
    titleSource: entry.titleSource,
  };
}

async function deleteEntryWithoutTombstone(entryId: number): Promise<void> {
  await db.transaction('rw', [db.entries, db.attachments, db.attachmentInsights], async () => {
    const attachments = await db.attachments.where('entryId').equals(entryId).toArray();
    for (const attachment of attachments) {
      if (attachment.id) {
        await db.attachmentInsights.delete(attachment.id);
      }
    }
    await db.attachments.where('entryId').equals(entryId).delete();
    await db.entries.delete(entryId);
  });
}

async function applyRemoteChanges(changes: CloudSyncChange[]): Promise<void> {
  for (const change of changes) {
    if (!change?.syncId || typeof change.updatedAtMs !== 'number') continue;

    const localEntry = await getEntryBySyncId(change.syncId);
    const localUpdatedAt = localEntry?.updatedAt ?? 0;

    if (change.deletedAtMs) {
      if (!localEntry) continue;
      if (localUpdatedAt > change.updatedAtMs) continue;
      if (localEntry.id) {
        await deleteEntryWithoutTombstone(localEntry.id);
      }
      continue;
    }

    if (!change.payload) continue;
    if (localUpdatedAt > change.updatedAtMs) continue;

    const payload = change.payload;
    const updatedAt = Number.isFinite(payload.updatedAt) ? payload.updatedAt : change.updatedAtMs;
    const createdAt = Number.isFinite(payload.createdAt) ? payload.createdAt : updatedAt;
    const aiAllowed = payload.aiAllowed ?? !payload.isPrivate;

    const updateData: DiaryEntry = {
      date: payload.date,
      text: payload.text,
      mood: payload.mood,
      tags: payload.tags ?? [],
      isPrivate: payload.isPrivate,
      aiAllowed,
      createdAt,
      updatedAt,
      attachmentCounts: payload.attachmentCounts,
      moodSource: payload.moodSource,
      semanticTags: payload.semanticTags ?? [],
      aiAnalyzedAt: payload.aiAnalyzedAt,
      title: payload.title ?? null,
      titleSource: payload.titleSource,
      syncId: change.syncId,
      syncUpdatedAt: change.updatedAtMs,
    };

    if (localEntry?.id) {
      await db.entries.update(localEntry.id, updateData);
    } else {
      await db.entries.add(updateData);
    }
  }
}

export async function syncNow(): Promise<CloudSyncResult> {
  if (!isCloudSyncEnabled()) {
    return { ok: false, reason: 'disabled' };
  }

  if (!navigator.onLine) {
    return { ok: false, reason: 'offline' };
  }

  const key = getCloudSyncKey();
  if (!key || key.length < MIN_SYNC_KEY_LENGTH) {
    return { ok: false, reason: 'missing_key' };
  }

  await ensureEntrySyncIds();

  const entries = await db.entries.toArray();
  const entriesToSync = entries.filter((entry) => {
    const syncUpdatedAt = entry.syncUpdatedAt ?? 0;
    return Boolean(entry.syncId) && entry.updatedAt > syncUpdatedAt;
  });

  const deletesToSync = await getPendingEntryDeletes();

  const changes: CloudSyncChange[] = [
    ...entriesToSync.map((entry) => ({
      syncId: entry.syncId as string,
      payload: toPayload(entry),
      updatedAtMs: entry.updatedAt,
      deletedAtMs: null,
    })),
    ...deletesToSync.map((item) => ({
      syncId: item.syncId,
      payload: null,
      updatedAtMs: item.deletedAt,
      deletedAtMs: item.deletedAt,
    })),
  ];

  const since = getLastCloudSyncAt() ?? 0;
  const deviceId = getOrCreateDeviceId();

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    serverTime: number;
    changes: CloudSyncChange[];
  }>('cloud-sync', {
    body: {
      since,
      changes,
      deviceId,
    },
    headers: {
      'x-sync-key': key,
    },
  });

  if (error || !data?.success) {
    return { ok: false, reason: 'remote_error' };
  }

  await applyRemoteChanges(data.changes ?? []);

  if (entriesToSync.length > 0) {
    await db.transaction('rw', db.entries, async () => {
      for (const entry of entriesToSync) {
        if (!entry.id) continue;
        await db.entries.update(entry.id, { syncUpdatedAt: entry.updatedAt });
      }
    });
  }

  if (deletesToSync.length > 0) {
    await clearEntryDeletes(deletesToSync.map((item) => item.syncId));
  }

  const serverTime = data.serverTime ?? Date.now();
  setLastCloudSyncAt(serverTime);

  return {
    ok: true,
    pulled: data.changes?.length ?? 0,
    pushed: entriesToSync.length,
    deleted: deletesToSync.length,
    serverTime,
  };
}

let syncIntervalId: number | null = null;

export function initCloudSyncScheduler(): void {
  if (syncIntervalId !== null) return;

  const runSync = () => {
    if (!isCloudSyncEnabled()) return;
    syncNow().catch(() => undefined);
  };

  window.addEventListener('online', runSync);
  syncIntervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      runSync();
    }
  }, 5 * 60 * 1000);

  runSync();
}
