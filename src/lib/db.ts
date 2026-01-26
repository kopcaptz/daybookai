import Dexie, { type EntityTable } from 'dexie';

// Счётчики вложений по типам (для календаря без чтения blobs)
export interface AttachmentCounts {
  image: number;
  video: number;
  audio: number;
}

// Типы для записей дневника
export interface DiaryEntry {
  id?: number;
  date: string; // ISO date string (YYYY-MM-DD)
  text: string;
  mood: number; // 1-5
  tags: string[];
  isPrivate: boolean;
  aiAllowed: boolean; // false if isPrivate
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  attachmentCounts?: AttachmentCounts; // Aggregated counts for calendar (optional for backward compat)
}

// Типы для вложений
export interface Attachment {
  id?: number;
  entryId: number;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number; // bytes
  duration?: number; // seconds (for video/audio)
  blob: Blob;
  thumbnail?: Blob; // for video
  createdAt: number;
}

// Типы для черновиков
export interface Draft {
  id: string; // 'new' or entry id
  text: string;
  mood: number;
  tags: string[];
  isPrivate: boolean;
  attachments: DraftAttachment[];
  updatedAt: number;
}

export interface DraftAttachment {
  tempId: string;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  duration?: number;
  blob: Blob;
  thumbnail?: Blob;
}

// Предустановленные теги
export const PRESET_TAGS = [
  'Работа',
  'Семья',
  'Здоровье',
  'Хобби',
  'Друзья',
  'Учёба',
  'Отдых',
  'Спорт',
];

// Лимиты для медиа
export const MEDIA_LIMITS = {
  image: {
    maxSize: 12 * 1024 * 1024, // 12MB after compression
    maxDimension: 2048,
    quality: 0.8,
  },
  video: {
    maxSize: 100 * 1024 * 1024, // 100MB
    maxDuration: 60, // seconds
  },
  audio: {
    maxSize: 25 * 1024 * 1024, // 25MB
    maxDuration: 10 * 60, // 10 minutes
  },
};

// Предупреждения о хранилище
export const STORAGE_WARNINGS = {
  warning: 500 * 1024 * 1024, // 500MB
  critical: 1024 * 1024 * 1024, // 1GB
};

// Daily Biography type
export interface StoredBiography {
  date: string;           // YYYY-MM-DD (primary key)
  generatedAt: number;    // timestamp
  status: 'pending' | 'complete' | 'failed';
  retryCount: number;
  biography: {
    title: string;
    narrative: string;       // 6–12 sentences
    highlights: string[];    // 3–6 bullets
    timeline: Array<{ timeLabel: string; summary: string }>; // chronological
    meta?: { 
      profile: string; 
      model?: string; 
      tokens?: number; 
      requestId?: string;
      style?: string;           // "daybook_biography_v1"
      confidence?: 'low' | 'medium' | 'high';
    };
  } | null;
  errorMessage?: string;
  lastRequestId?: string;  // For error correlation with support
  sourceEntryIds: number[];
}

// Attachment insight (photo analysis result)
export interface AttachmentInsight {
  attachmentId: number;  // primary key, links to attachment
  createdAt: number;
  model: string;
  promptVersion: string;
  result: {
    description: string;
    emotions: string[];
    tags: string[];
    reflection: string;
  };
}

// Receipt types for receipt scanner feature
export interface Receipt {
  id?: number;
  date: string | null; // YYYY-MM-DD from receipt
  storeName: string;
  storeAddress: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  currency: string | null;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  attachmentId: number | null; // Link to original photo
  entryId: number | null; // Optional link to diary entry
  createdAt: number;
  updatedAt: number;
}

export interface ReceiptItem {
  id?: number;
  receiptId: number;
  name: string;
  qty: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  discount: number | null;
  category: string | null;
}

// Scan diagnostics log (privacy-safe metadata only)
export interface ScanLog {
  id?: number;
  timestamp: number;
  originalImageBytes: number;
  compressedBytes: number;
  model: string;
  durationMs: number;
  httpStatus: number;
  requestId: string;
  errorCode: string | null;
}

// Gentle Nudges: Reminders from actionable captures
export type ReminderStatus = 'pending' | 'done' | 'dismissed';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id?: number;
  entryId: number;              // Required: links back to source entry
  sourceText: string;           // Original captured text snippet
  actionText: string;           // User-editable action description
  dueAt: number;                // Timestamp (ms) when reminder is due
  status: ReminderStatus;
  snoozedUntil?: number;        // For snooze feature (timestamp)
  repeat: ReminderRepeat;       // Repeat schedule (default 'none')
  skipNext?: boolean;           // Skip next occurrence (one-time skip)
  createdAt: number;
  updatedAt: number;
}

// Biography settings
export interface BiographySettings {
  bioTime: string; // HH:MM format, default "21:00"
  lastPromptDate?: string; // YYYY-MM-DD
}

const DEFAULT_BIO_SETTINGS: BiographySettings = {
  bioTime: '21:00',
};

const BIO_SETTINGS_KEY = 'daybook-bio-settings';

export function loadBioSettings(): BiographySettings {
  try {
    const saved = localStorage.getItem(BIO_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_BIO_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_BIO_SETTINGS;
}

export function saveBioSettings(settings: Partial<BiographySettings>): void {
  const current = loadBioSettings();
  localStorage.setItem(BIO_SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

// База данных Dexie
class DaybookDatabase extends Dexie {
  entries!: EntityTable<DiaryEntry, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  drafts!: EntityTable<Draft, 'id'>;
  biographies!: EntityTable<StoredBiography, 'date'>;
  attachmentInsights!: EntityTable<AttachmentInsight, 'attachmentId'>;
  receipts!: EntityTable<Receipt, 'id'>;
  receiptItems!: EntityTable<ReceiptItem, 'id'>;
  scanLogs!: EntityTable<ScanLog, 'id'>;
  reminders!: EntityTable<Reminder, 'id'>;

  constructor() {
    super('DaybookDB');
    
    this.version(1).stores({
      entries: '++id, date, mood, *tags, isPrivate, createdAt, updatedAt',
    });

    this.version(2).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
    }).upgrade(tx => {
      // Add aiAllowed to existing entries
      return tx.table('entries').toCollection().modify(entry => {
        entry.aiAllowed = !entry.isPrivate;
      });
    });

    // Version 3: Add biographies table
    this.version(3).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
    });

    // Version 4: Add attachment insights table for photo analysis
    this.version(4).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
    });

    // Version 5: Add receipts and receipt items tables for receipt scanner
    this.version(5).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
      receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
      receiptItems: '++id, receiptId, category',
    });

    // Version 6: Add scan diagnostics logs
    this.version(6).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
      receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
      receiptItems: '++id, receiptId, category',
      scanLogs: '++id, timestamp',
    });

    // Version 7: Add Gentle Nudges reminders table
    this.version(7).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
      receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
      receiptItems: '++id, receiptId, category',
      scanLogs: '++id, timestamp',
      reminders: '++id, entryId, status, dueAt, createdAt',
    });

    // Version 8: Add repeat field to reminders for recurring support
    this.version(8).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
      receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
      receiptItems: '++id, receiptId, category',
      scanLogs: '++id, timestamp',
      reminders: '++id, entryId, status, dueAt, createdAt',
    }).upgrade(tx => {
      // Add repeat='none' to existing reminders
      return tx.table('reminders').toCollection().modify(reminder => {
        if (reminder.repeat === undefined) {
          reminder.repeat = 'none';
        }
      });
    });

    // Version 9: Add skipNext field to reminders for skip-next-occurrence feature
    this.version(9).stores({
      entries: '++id, date, mood, *tags, isPrivate, aiAllowed, createdAt, updatedAt',
      attachments: '++id, entryId, kind, createdAt',
      drafts: 'id, updatedAt',
      biographies: 'date, status, generatedAt',
      attachmentInsights: 'attachmentId, createdAt',
      receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
      receiptItems: '++id, receiptId, category',
      scanLogs: '++id, timestamp',
      reminders: '++id, entryId, status, dueAt, createdAt',
    }).upgrade(tx => {
      // Add skipNext=false to existing reminders
      return tx.table('reminders').toCollection().modify(reminder => {
        if (reminder.skipNext === undefined) {
          reminder.skipNext = false;
        }
      });
    });
  }
}

export const db = new DaybookDatabase();

// Global blocked handler - fires when DB is blocked by another tab/version
db.on('blocked', () => {
  console.warn('[Dexie] Database blocked by another tab - user should close other tabs');
});

// Override open to add custom error logging
db.open().catch((error) => {
  console.error('[Dexie] Failed to open database:', {
    name: error.name,
    message: error.message,
  });
});

// CRUD операции для записей
export async function createEntry(entry: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt' | 'aiAllowed'>): Promise<number> {
  const now = Date.now();
  return await db.entries.add({
    ...entry,
    aiAllowed: !entry.isPrivate,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateEntry(id: number, updates: Partial<Omit<DiaryEntry, 'id' | 'createdAt'>>): Promise<void> {
  const updateData: any = {
    ...updates,
    updatedAt: Date.now(),
  };
  
  // Sync aiAllowed with isPrivate
  if (updates.isPrivate !== undefined) {
    updateData.aiAllowed = !updates.isPrivate;
  }
  
  await db.entries.update(id, updateData);
}

export async function deleteEntry(id: number): Promise<void> {
  await db.transaction('rw', [db.entries, db.attachments, db.attachmentInsights], async () => {
    // Delete insights first (cascade from attachments)
    const attachments = await db.attachments.where('entryId').equals(id).toArray();
    for (const attachment of attachments) {
      if (attachment.id) {
        await db.attachmentInsights.delete(attachment.id);
      }
    }
    // Delete attachments
    await db.attachments.where('entryId').equals(id).delete();
    // Delete entry
    await db.entries.delete(id);
  });
}

export async function getEntryById(id: number): Promise<DiaryEntry | undefined> {
  return await db.entries.get(id);
}

export async function getEntriesByDate(date: string): Promise<DiaryEntry[]> {
  return await db.entries.where('date').equals(date).reverse().sortBy('createdAt');
}

export async function getAllEntries(): Promise<DiaryEntry[]> {
  return await db.entries.orderBy('createdAt').reverse().toArray();
}

export async function searchEntries(query: string): Promise<DiaryEntry[]> {
  const lowerQuery = query.toLowerCase();
  const allEntries = await db.entries.toArray();
  
  return allEntries.filter(entry => 
    entry.text.toLowerCase().includes(lowerQuery) ||
    entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  ).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getEntriesByDateRange(startDate: string, endDate: string): Promise<DiaryEntry[]> {
  return await db.entries
    .where('date')
    .between(startDate, endDate, true, true)
    .reverse()
    .sortBy('createdAt');
}

export async function getDatesWithEntries(): Promise<string[]> {
  const entries = await db.entries.toArray();
  const dates = new Set(entries.map(e => e.date));
  return Array.from(dates);
}

export async function getAverageMoodByDate(date: string): Promise<number | null> {
  const entries = await getEntriesByDate(date);
  if (entries.length === 0) return null;
  const sum = entries.reduce((acc, e) => acc + e.mood, 0);
  return Math.round(sum / entries.length);
}

export async function getAllTags(): Promise<string[]> {
  const entries = await db.entries.toArray();
  const tags = new Set<string>();
  entries.forEach(entry => entry.tags.forEach(tag => tags.add(tag)));
  return Array.from(tags).sort();
}

// CRUD операции для вложений

// Helper: Default empty counts (exported for backfill)
export const emptyAttachmentCounts = (): AttachmentCounts => ({ image: 0, video: 0, audio: 0 });

/**
 * Increment attachment count for an entry.
 * Must be called within a transaction that includes db.entries.
 * Skips if entryId <= 0 (standalone attachments like receipts).
 */
async function incrementAttachmentCount(entryId: number, kind: Attachment['kind']): Promise<void> {
  if (entryId <= 0) return;
  
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  
  const counts = entry.attachmentCounts ?? emptyAttachmentCounts();
  counts[kind] = (counts[kind] || 0) + 1;
  
  await db.entries.update(entryId, { attachmentCounts: counts, updatedAt: Date.now() });
}

/**
 * Decrement attachment count for an entry.
 * Must be called within a transaction that includes db.entries.
 * Skips if entryId <= 0. Does not go below 0.
 */
async function decrementAttachmentCount(entryId: number, kind: Attachment['kind']): Promise<void> {
  if (entryId <= 0) return;
  
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  
  const counts = entry.attachmentCounts ?? emptyAttachmentCounts();
  counts[kind] = Math.max(0, (counts[kind] || 0) - 1);
  
  await db.entries.update(entryId, { attachmentCounts: counts, updatedAt: Date.now() });
}

/**
 * Reset attachment counts to zero for an entry.
 * Must be called within a transaction that includes db.entries.
 */
async function resetAttachmentCounts(entryId: number): Promise<void> {
  if (entryId <= 0) return;
  
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  
  await db.entries.update(entryId, { 
    attachmentCounts: emptyAttachmentCounts(), 
    updatedAt: Date.now() 
  });
}

/**
 * Add an attachment and update entry's attachmentCounts.
 * If called within a transaction that includes db.entries, counts are updated atomically.
 * If called standalone, counts update is best-effort (non-atomic).
 */
export async function addAttachment(attachment: Omit<Attachment, 'id' | 'createdAt'>): Promise<number> {
  const attachmentId = await db.attachments.add({
    ...attachment,
    createdAt: Date.now(),
  });
  
  // Update counts (works within existing transaction if present)
  await incrementAttachmentCount(attachment.entryId, attachment.kind);
  
  return attachmentId;
}

export async function getAttachmentsByEntryId(entryId: number): Promise<Attachment[]> {
  return await db.attachments.where('entryId').equals(entryId).toArray();
}

/**
 * Delete a single attachment by ID and update entry's attachmentCounts.
 */
export async function deleteAttachment(id: number): Promise<void> {
  await db.transaction('rw', [db.attachments, db.attachmentInsights, db.entries], async () => {
    // Get attachment first to know entryId and kind
    const attachment = await db.attachments.get(id);
    
    // Delete insight and attachment
    await db.attachmentInsights.delete(id);
    await db.attachments.delete(id);
    
    // Decrement count if attachment existed and had valid entryId
    if (attachment && attachment.entryId > 0) {
      await decrementAttachmentCount(attachment.entryId, attachment.kind);
    }
  });
}

/**
 * Delete all attachments for an entry - without transaction wrapper.
 * MUST be called within an existing transaction that includes 
 * [db.attachments, db.attachmentInsights, db.entries] tables.
 * Resets entry's attachmentCounts to zero.
 */
export async function deleteAttachmentsByEntryIdInTransaction(entryId: number): Promise<void> {
  const attachments = await db.attachments.where('entryId').equals(entryId).toArray();
  const attachmentIds = attachments.map(a => a.id!);
  
  // Delete insights for all attachments
  for (const id of attachmentIds) {
    await db.attachmentInsights.delete(id);
  }
  // Delete attachments
  await db.attachments.where('entryId').equals(entryId).delete();
  
  // Reset counts to zero (not delete-by-delete, just reset)
  await resetAttachmentCounts(entryId);
}

/**
 * Delete all attachments for an entry - standalone with own transaction.
 * Use this when NOT already in a transaction.
 */
export async function deleteAttachmentsByEntryId(entryId: number): Promise<void> {
  await db.transaction('rw', [db.attachments, db.attachmentInsights, db.entries], async () => {
    await deleteAttachmentsByEntryIdInTransaction(entryId);
  });
}

// CRUD операции для инсайтов вложений
export async function saveAttachmentInsight(insight: AttachmentInsight): Promise<void> {
  await db.attachmentInsights.put(insight);
}

export async function getAttachmentInsight(attachmentId: number): Promise<AttachmentInsight | undefined> {
  return await db.attachmentInsights.get(attachmentId);
}

export async function deleteAttachmentInsight(attachmentId: number): Promise<void> {
  await db.attachmentInsights.delete(attachmentId);
}

// CRUD операции для черновиков
export async function saveDraft(draft: Draft): Promise<void> {
  await db.drafts.put(draft);
}

export async function getDraft(id: string): Promise<Draft | undefined> {
  return await db.drafts.get(id);
}

export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
}

export async function getAllDrafts(): Promise<Draft[]> {
  return await db.drafts.toArray();
}

// Подсчёт использования хранилища
export async function getStorageUsage(): Promise<{
  entries: number;
  attachments: number;
  drafts: number;
  total: number;
}> {
  let attachmentsSize = 0;
  let draftsSize = 0;

  const attachments = await db.attachments.toArray();
  attachments.forEach(a => {
    attachmentsSize += a.blob.size;
    if (a.thumbnail) attachmentsSize += a.thumbnail.size;
  });

  const drafts = await db.drafts.toArray();
  drafts.forEach(d => {
    d.attachments.forEach(a => {
      draftsSize += a.blob.size;
      if (a.thumbnail) draftsSize += a.thumbnail.size;
    });
  });

  // Rough estimate for entries (text data)
  const entries = await db.entries.toArray();
  const entriesSize = entries.reduce((acc, e) => acc + new Blob([JSON.stringify(e)]).size, 0);

  return {
    entries: entriesSize,
    attachments: attachmentsSize,
    drafts: draftsSize,
    total: entriesSize + attachmentsSize + draftsSize,
  };
}

// Экспорт и очистка
export async function exportAllData(): Promise<string> {
  const entries = await getAllEntries();
  return JSON.stringify({ 
    entries, 
    exportedAt: new Date().toISOString(),
    note: 'Вложения (фото, видео, аудио) не экспортируются'
  }, null, 2);
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.entries, db.attachments, db.drafts, db.receipts, db.receiptItems, db.scanLogs], async () => {
    await db.entries.clear();
    await db.attachments.clear();
    await db.drafts.clear();
    await db.receipts.clear();
    await db.receiptItems.clear();
    await db.scanLogs.clear();
  });
}

// Scan diagnostics CRUD
export async function addScanLog(log: Omit<ScanLog, 'id'>): Promise<number> {
  return await db.scanLogs.add(log);
}

export async function getAllScanLogs(): Promise<ScanLog[]> {
  return await db.scanLogs.orderBy('timestamp').reverse().toArray();
}

export async function clearScanLogs(): Promise<void> {
  await db.scanLogs.clear();
}

// Get receipts by entry ID
export async function getReceiptsByEntryId(entryId: number): Promise<Receipt[]> {
  return await db.receipts.where('entryId').equals(entryId).toArray();
}

// ============= Backfill attachmentCounts =============

const BACKFILL_DONE_KEY = 'daybook-attachment-counts-backfill-done';
const BACKFILL_BATCH_SIZE = 100;

/**
 * Check if backfill has already been completed.
 */
export function isBackfillDone(): boolean {
  try {
    return localStorage.getItem(BACKFILL_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark backfill as completed.
 */
function markBackfillDone(): void {
  try {
    localStorage.setItem(BACKFILL_DONE_KEY, 'true');
  } catch {
    // ignore
  }
}

/**
 * Backfill attachmentCounts for entries that don't have them.
 * Uses cursor iteration to avoid loading all attachments into memory.
 * Safe to call multiple times (checks localStorage flag).
 * 
 * @returns Number of entries updated, or -1 if already done
 */
export async function backfillAttachmentCounts(): Promise<number> {
  // Skip if already done
  if (isBackfillDone()) {
    console.log('[Backfill] Already completed, skipping');
    return -1;
  }
  
  console.log('[Backfill] Starting attachmentCounts backfill...');
  const startTime = Date.now();
  
  // Step 1: Build counts map using cursor (NO toArray!)
  const countsMap = new Map<number, AttachmentCounts>();
  
  await db.attachments.each((attachment) => {
    // Skip standalone (entryId <= 0)
    if (attachment.entryId <= 0) return;
    
    const existing = countsMap.get(attachment.entryId) ?? { image: 0, video: 0, audio: 0 };
    existing[attachment.kind] = (existing[attachment.kind] || 0) + 1;
    countsMap.set(attachment.entryId, existing);
  });
  
  console.log(`[Backfill] Counted attachments for ${countsMap.size} entries`);
  
  // Step 2: Find entries that need updating (missing attachmentCounts)
  const entriesToUpdate: number[] = [];
  
  await db.entries.each((entry) => {
    if (entry.id && entry.attachmentCounts === undefined) {
      entriesToUpdate.push(entry.id);
    }
  });
  
  console.log(`[Backfill] Found ${entriesToUpdate.length} entries without attachmentCounts`);
  
  if (entriesToUpdate.length === 0) {
    markBackfillDone();
    console.log('[Backfill] No entries to update, marking done');
    return 0;
  }
  
  // Step 3: Update entries in batches
  let updated = 0;
  
  for (let i = 0; i < entriesToUpdate.length; i += BACKFILL_BATCH_SIZE) {
    const batch = entriesToUpdate.slice(i, i + BACKFILL_BATCH_SIZE);
    
    await db.transaction('rw', db.entries, async () => {
      for (const entryId of batch) {
        const counts = countsMap.get(entryId) ?? { image: 0, video: 0, audio: 0 };
        await db.entries.update(entryId, { attachmentCounts: counts });
        updated++;
      }
    });
    
    // Small delay between batches to avoid blocking UI
    if (i + BACKFILL_BATCH_SIZE < entriesToUpdate.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  markBackfillDone();
  const duration = Date.now() - startTime;
  console.log(`[Backfill] Completed: ${updated} entries updated in ${duration}ms`);
  
  return updated;
}

/**
 * Reset backfill flag (for debugging/testing).
 */
export function resetBackfillFlag(): void {
  try {
    localStorage.removeItem(BACKFILL_DONE_KEY);
    console.log('[Backfill] Flag reset');
  } catch {
    // ignore
  }
}

// ============================================
// REMINDER CRUD OPERATIONS (Gentle Nudges MVP)
// ============================================

import { getEndOfTodayTimestamp, getStartOfTodayTimestamp, computeNextDueAt } from './reminderUtils';
import { format } from 'date-fns';

/**
 * Create a new reminder linked to an entry.
 */
export async function createReminder(
  reminder: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const now = Date.now();
  return await db.reminders.add({
    ...reminder,
    repeat: reminder.repeat ?? 'none',
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Get a reminder by ID.
 */
export async function getReminderById(id: number): Promise<Reminder | undefined> {
  return await db.reminders.get(id);
}

/**
 * Get all reminders for an entry.
 */
export async function getRemindersByEntryId(entryId: number): Promise<Reminder[]> {
  return await db.reminders.where('entryId').equals(entryId).toArray();
}

/**
 * Get pending reminders that are due today or overdue.
 * This is the main query for Today page and notifications.
 */
export async function getPendingTodayAndOverdueReminders(): Promise<Reminder[]> {
  const endOfToday = getEndOfTodayTimestamp();
  
  return await db.reminders
    .where('status')
    .equals('pending')
    .filter(r => r.dueAt <= endOfToday && (!r.snoozedUntil || r.snoozedUntil <= Date.now()))
    .toArray();
}

/**
 * Get overdue reminders only (due before start of today).
 */
export async function getOverdueReminders(): Promise<Reminder[]> {
  const startOfToday = getStartOfTodayTimestamp();
  
  return await db.reminders
    .where('status')
    .equals('pending')
    .filter(r => r.dueAt < startOfToday && (!r.snoozedUntil || r.snoozedUntil <= Date.now()))
    .toArray();
}

/**
 * Get reminders due today (not overdue).
 */
export async function getTodayReminders(): Promise<Reminder[]> {
  const startOfToday = getStartOfTodayTimestamp();
  const endOfToday = getEndOfTodayTimestamp();
  
  return await db.reminders
    .where('status')
    .equals('pending')
    .filter(r => 
      r.dueAt >= startOfToday && 
      r.dueAt <= endOfToday && 
      (!r.snoozedUntil || r.snoozedUntil <= Date.now())
    )
    .toArray();
}

/**
 * Update reminder status.
 */
export async function updateReminderStatus(
  id: number,
  status: ReminderStatus
): Promise<void> {
  await db.reminders.update(id, { status, updatedAt: Date.now() });
}

/**
 * Mark reminder as done (simple, no repeat handling).
 */
export async function markReminderDone(id: number): Promise<void> {
  await updateReminderStatus(id, 'done');
}

/**
 * Complete a reminder: mark as done + create next occurrence if repeating.
 * This is the main "Done" handler for swipe and detail page.
 * Returns the new reminder ID if a repeat was created, or null.
 */
export async function completeReminder(id: number): Promise<number | null> {
  const reminder = await getReminderById(id);
  if (!reminder) return null;
  
  // Mark current as done
  await markReminderDone(id);
  
  // If not repeating, we're done
  if (!reminder.repeat || reminder.repeat === 'none') {
    return null;
  }
  
  // If skipNext is true, reset it and don't create next occurrence
  if (reminder.skipNext) {
    await db.reminders.update(id, { skipNext: false, updatedAt: Date.now() });
    return null;
  }
  
  // Compute next due date
  const nextDueAt = computeNextDueAt(reminder.dueAt, reminder.repeat);
  if (!nextDueAt) return null;
  
  // Create a new source diary entry (Variant B)
  const nextDateStr = format(new Date(nextDueAt), 'yyyy-MM-dd');
  const newEntryId = await createEntry({
    date: nextDateStr,
    text: reminder.actionText,
    mood: null as any, // minimal entry
    tags: [],
    isPrivate: false,
  });
  
  // Create new reminder linked to new entry
  const newReminderId = await createReminder({
    entryId: newEntryId,
    sourceText: reminder.actionText,
    actionText: reminder.actionText,
    dueAt: nextDueAt,
    status: 'pending',
    repeat: reminder.repeat,
  });
  
  return newReminderId;
}

/**
 * Update reminder repeat setting.
 */
export async function updateReminderRepeat(id: number, repeat: ReminderRepeat): Promise<void> {
  await db.reminders.update(id, { repeat, updatedAt: Date.now() });
}

/**
 * Update reminder skipNext flag.
 */
export async function updateReminderSkipNext(id: number, skipNext: boolean): Promise<void> {
  await db.reminders.update(id, { skipNext, updatedAt: Date.now() });
}

/**
 * Dismiss a reminder.
 */
export async function dismissReminder(id: number): Promise<void> {
  await updateReminderStatus(id, 'dismissed');
}

/**
 * Snooze a reminder until a specific time.
 */
export async function snoozeReminder(id: number, snoozedUntil: number): Promise<void> {
  await db.reminders.update(id, { snoozedUntil, updatedAt: Date.now() });
}

/**
 * Reschedule a reminder to a new due time.
 */
export async function rescheduleReminder(id: number, newDueAt: number): Promise<void> {
  await db.reminders.update(id, { 
    dueAt: newDueAt, 
    snoozedUntil: undefined, 
    updatedAt: Date.now() 
  });
}

/**
 * Update reminder action text.
 */
export async function updateReminderText(id: number, actionText: string): Promise<void> {
  await db.reminders.update(id, { actionText, updatedAt: Date.now() });
}

/**
 * Delete a reminder.
 */
export async function deleteReminder(id: number): Promise<void> {
  await db.reminders.delete(id);
}

/**
 * Get count of pending reminders due today or overdue.
 * Useful for badge/indicator.
 */
export async function getPendingReminderCount(): Promise<number> {
  const reminders = await getPendingTodayAndOverdueReminders();
  return reminders.length;
}

/**
 * Weekly stats for insights widget.
 */
export interface WeeklyStats {
  entries7d: number;
  avgMood7d: number | null;
  moodTrend: 'up' | 'down' | 'flat';
  pendingReminders: number;
  streakDays: number;
}

/**
 * Format a Date to yyyy-MM-dd in local time.
 */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate streak (consecutive days with at least 1 entry).
 * Uses entry.date (yyyy-MM-dd), not createdAt.
 * If today has entry => starts from today.
 * Else if yesterday has entry => starts from yesterday (user hasn't written yet).
 * Counts backward until break.
 */
function calculateStreak(datesWithEntries: Set<string>): number {
  const today = new Date();
  const todayStr = formatDateLocal(today);
  
  // Determine start date
  let startDate: Date;
  if (datesWithEntries.has(todayStr)) {
    startDate = today;
  } else {
    // Check yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateLocal(yesterday);
    if (datesWithEntries.has(yesterdayStr)) {
      startDate = yesterday;
    } else {
      return 0; // No streak
    }
  }
  
  // Count consecutive days backward from startDate
  let streak = 0;
  let current = new Date(startDate);
  
  while (true) {
    const currentStr = formatDateLocal(current);
    if (datesWithEntries.has(currentStr)) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Get weekly statistics for the insights widget.
 * Compares last 7 days vs previous 7 days for trend.
 */
export async function getWeeklyStats(): Promise<WeeklyStats> {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  
  // Time windows
  const start7d = now - 7 * msPerDay;
  const start14d = now - 14 * msPerDay;
  
  // Get all entries for last 14 days
  const allEntries = await db.entries.toArray();
  
  // Filter by createdAt timestamp
  const entries7d = allEntries.filter(e => e.createdAt >= start7d && e.createdAt <= now);
  const entriesPrev7d = allEntries.filter(e => e.createdAt >= start14d && e.createdAt < start7d);
  
  // Calculate avg mood for last 7 days (only entries with valid mood 1-5)
  const moodsLast7d = entries7d.map(e => e.mood).filter(m => m >= 1 && m <= 5);
  const avgMood7d = moodsLast7d.length > 0 
    ? Math.round((moodsLast7d.reduce((a, b) => a + b, 0) / moodsLast7d.length) * 10) / 10
    : null;
  
  // Calculate avg mood for previous 7 days
  const moodsPrev7d = entriesPrev7d.map(e => e.mood).filter(m => m >= 1 && m <= 5);
  const avgMoodPrev7d = moodsPrev7d.length > 0
    ? moodsPrev7d.reduce((a, b) => a + b, 0) / moodsPrev7d.length
    : null;
  
  // Determine trend (threshold 0.15)
  let moodTrend: 'up' | 'down' | 'flat' = 'flat';
  if (avgMood7d !== null && avgMoodPrev7d !== null) {
    const diff = avgMood7d - avgMoodPrev7d;
    if (diff > 0.15) moodTrend = 'up';
    else if (diff < -0.15) moodTrend = 'down';
  }
  
  // Get pending reminders count
  const pendingReminders = await getPendingReminderCount();
  
  // Calculate streak from all entries (using entry.date, not createdAt)
  const datesWithEntries = new Set<string>(
    allEntries.map(e => e.date).filter((d): d is string => !!d)
  );
  const streakDays = calculateStreak(datesWithEntries);
  
  return {
    entries7d: entries7d.length,
    avgMood7d,
    moodTrend,
    pendingReminders,
    streakDays,
  };
}
