/**
 * Backup Service for DaybookDB
 * Full export/import of IndexedDB with blob-to-base64 conversion
 */

import { db } from './db';
import { APP_VERSION } from './appVersion';

// Types
export interface BackupManifest {
  dbName: string;
  dbVersion: number;
  exportedAt: string;
  appVersion: string;
  tables: Record<string, number>;
}

export interface BackupPayload {
  manifest: BackupManifest;
  entries: unknown[];
  attachments: unknown[]; // Blobs converted to base64
  drafts: unknown[];
  biographies: unknown[];
  reminders: unknown[];
  receipts: unknown[];
  receiptItems: unknown[];
  discussionSessions: unknown[];
  discussionMessages: unknown[];
  weeklyInsights: unknown[];
  audioTranscripts: unknown[];
  attachmentInsights: unknown[];
  analysisQueue: unknown[];
  scanLogs: unknown[];
}

export interface ExportProgress {
  table: string;
  current: number;
  total: number;
}

export interface ImportSummary {
  entries: number;
  attachments: number;
  drafts: number;
  biographies: number;
  reminders: number;
  receipts: number;
  receiptItems: number;
  discussionSessions: number;
  discussionMessages: number;
  weeklyInsights: number;
  audioTranscripts: number;
  attachmentInsights: number;
  analysisQueue: number;
  scanLogs: number;
}

// Blob <-> Base64 conversion
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// Last backup date storage
const LAST_BACKUP_KEY = 'daybook-last-backup';

export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function setLastBackupDate(date: string): void {
  localStorage.setItem(LAST_BACKUP_KEY, date);
}

/**
 * Export all tables from DaybookDB to a JSON payload
 */
export async function exportFullBackup(
  onProgress?: (progress: ExportProgress) => void
): Promise<BackupPayload> {
  // Helper to process a table
  async function exportTable<T>(
    tableName: string,
    table: { toArray: () => Promise<T[]> },
    processRow?: (row: T) => Promise<unknown>
  ): Promise<unknown[]> {
    const rows = await table.toArray();
    const result: unknown[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (processRow) {
        result.push(await processRow(row));
      } else {
        result.push(row);
      }
      
      if (onProgress && i % 10 === 0) {
        onProgress({ table: tableName, current: i + 1, total: rows.length });
      }
    }
    
    if (onProgress) {
      onProgress({ table: tableName, current: rows.length, total: rows.length });
    }
    
    return result;
  }

  // Process attachments - convert blobs to base64
  const processAttachment = async (att: {
    id?: number;
    entryId: number;
    kind: string;
    mimeType: string;
    size: number;
    duration?: number;
    blob: Blob;
    thumbnail?: Blob;
    createdAt: number;
  }) => {
    const blobBase64 = await blobToBase64(att.blob);
    const thumbnailBase64 = att.thumbnail ? await blobToBase64(att.thumbnail) : undefined;
    return {
      ...att,
      blob: blobBase64,
      thumbnail: thumbnailBase64,
    };
  };

  // Process drafts - convert blob attachments to base64
  const processDraft = async (draft: {
    id: string;
    text: string;
    mood: number;
    tags: string[];
    isPrivate: boolean;
    attachments: Array<{
      tempId: string;
      kind: string;
      mimeType: string;
      size: number;
      duration?: number;
      blob: Blob;
      thumbnail?: Blob;
    }>;
    updatedAt: number;
  }) => {
    const processedAttachments = await Promise.all(
      draft.attachments.map(async (att) => ({
        ...att,
        blob: await blobToBase64(att.blob),
        thumbnail: att.thumbnail ? await blobToBase64(att.thumbnail) : undefined,
      }))
    );
    return {
      ...draft,
      attachments: processedAttachments,
    };
  };

  // Export all tables
  const [
    entries,
    attachments,
    drafts,
    biographies,
    reminders,
    receipts,
    receiptItems,
    discussionSessions,
    discussionMessages,
    weeklyInsights,
    audioTranscripts,
    attachmentInsights,
    analysisQueue,
    scanLogs,
  ] = await Promise.all([
    exportTable('entries', db.entries),
    exportTable('attachments', db.attachments, processAttachment),
    exportTable('drafts', db.drafts, processDraft),
    exportTable('biographies', db.biographies),
    exportTable('reminders', db.reminders),
    exportTable('receipts', db.receipts),
    exportTable('receiptItems', db.receiptItems),
    exportTable('discussionSessions', db.discussionSessions),
    exportTable('discussionMessages', db.discussionMessages),
    exportTable('weeklyInsights', db.weeklyInsights),
    exportTable('audioTranscripts', db.audioTranscripts),
    exportTable('attachmentInsights', db.attachmentInsights),
    exportTable('analysisQueue', db.analysisQueue),
    exportTable('scanLogs', db.scanLogs),
  ]);

  const manifest: BackupManifest = {
    dbName: 'DaybookDB',
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tables: {
      entries: entries.length,
      attachments: attachments.length,
      drafts: drafts.length,
      biographies: biographies.length,
      reminders: reminders.length,
      receipts: receipts.length,
      receiptItems: receiptItems.length,
      discussionSessions: discussionSessions.length,
      discussionMessages: discussionMessages.length,
      weeklyInsights: weeklyInsights.length,
      audioTranscripts: audioTranscripts.length,
      attachmentInsights: attachmentInsights.length,
      analysisQueue: analysisQueue.length,
      scanLogs: scanLogs.length,
    },
  };

  return {
    manifest,
    entries,
    attachments,
    drafts,
    biographies,
    reminders,
    receipts,
    receiptItems,
    discussionSessions,
    discussionMessages,
    weeklyInsights,
    audioTranscripts,
    attachmentInsights,
    analysisQueue,
    scanLogs,
  };
}

/**
 * Validate backup file structure
 */
export function validateBackupManifest(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  
  const payload = data as Record<string, unknown>;
  const manifest = payload.manifest as Record<string, unknown> | undefined;
  
  if (!manifest) return false;
  if (manifest.dbName !== 'DaybookDB') return false;
  if (typeof manifest.dbVersion !== 'number') return false;
  if (typeof manifest.exportedAt !== 'string') return false;
  
  // Check required tables exist
  const requiredTables = ['entries', 'attachments', 'drafts'];
  for (const table of requiredTables) {
    if (!Array.isArray(payload[table])) return false;
  }
  
  return true;
}

/**
 * Get summary of what will be imported
 */
export function getImportSummary(payload: BackupPayload): ImportSummary {
  return {
    entries: payload.entries?.length || 0,
    attachments: payload.attachments?.length || 0,
    drafts: payload.drafts?.length || 0,
    biographies: payload.biographies?.length || 0,
    reminders: payload.reminders?.length || 0,
    receipts: payload.receipts?.length || 0,
    receiptItems: payload.receiptItems?.length || 0,
    discussionSessions: payload.discussionSessions?.length || 0,
    discussionMessages: payload.discussionMessages?.length || 0,
    weeklyInsights: payload.weeklyInsights?.length || 0,
    audioTranscripts: payload.audioTranscripts?.length || 0,
    attachmentInsights: payload.attachmentInsights?.length || 0,
    analysisQueue: payload.analysisQueue?.length || 0,
    scanLogs: payload.scanLogs?.length || 0,
  };
}

/**
 * Import backup into DaybookDB
 */
export async function importFullBackup(
  payload: BackupPayload,
  options: { wipeExisting: boolean } = { wipeExisting: true },
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  // Wipe existing data if requested
  if (options.wipeExisting) {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  }

  // Helper to import a table using db.table() API
  async function importTableData(
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[] | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processRow?: (row: any) => any
  ): Promise<void> {
    if (!rows || rows.length === 0) return;
    
    const processed = processRow ? rows.map(processRow) : rows;
    const table = db.table(tableName);
    
    // Import in chunks to avoid memory issues
    const chunkSize = 100;
    for (let i = 0; i < processed.length; i += chunkSize) {
      const chunk = processed.slice(i, i + chunkSize);
      await table.bulkPut(chunk);
      
      if (onProgress) {
        onProgress({
          table: tableName,
          current: Math.min(i + chunkSize, processed.length),
          total: processed.length,
        });
      }
    }
  }

  // Process attachment - convert base64 back to blob
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processAttachment = (att: any) => ({
    ...att,
    blob: base64ToBlob(att.blob),
    thumbnail: att.thumbnail ? base64ToBlob(att.thumbnail) : undefined,
  });

  // Process draft - convert base64 attachments back to blobs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processDraft = (draft: any) => ({
    ...draft,
    attachments: draft.attachments?.map((att: { blob: string; thumbnail?: string }) => ({
      ...att,
      blob: base64ToBlob(att.blob),
      thumbnail: att.thumbnail ? base64ToBlob(att.thumbnail) : undefined,
    })) || [],
  });

  // Import all tables in transaction
  await db.transaction('rw', db.tables, async () => {
    // Import in specific order for referential integrity
    await importTableData('entries', payload.entries);
    await importTableData('attachments', payload.attachments, processAttachment);
    await importTableData('drafts', payload.drafts, processDraft);
    await importTableData('biographies', payload.biographies);
    await importTableData('reminders', payload.reminders);
    await importTableData('receipts', payload.receipts);
    await importTableData('receiptItems', payload.receiptItems);
    await importTableData('discussionSessions', payload.discussionSessions);
    await importTableData('discussionMessages', payload.discussionMessages);
    await importTableData('weeklyInsights', payload.weeklyInsights);
    await importTableData('audioTranscripts', payload.audioTranscripts);
    await importTableData('attachmentInsights', payload.attachmentInsights);
    await importTableData('analysisQueue', payload.analysisQueue);
    await importTableData('scanLogs', payload.scanLogs);
  });
}

/**
 * Download backup as JSON file
 */
export function downloadBackupFile(payload: BackupPayload): void {
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `daybook-backup-${date}.json`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Save last backup date
  setLastBackupDate(new Date().toISOString());
}

/**
 * Read backup file from user selection
 */
export function readBackupFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        resolve(data);
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
