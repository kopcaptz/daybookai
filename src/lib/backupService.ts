/**
 * Backup Service for DaybookDB
 * Full export/import of IndexedDB with ZIP compression and blob handling
 */

import { db } from './db';
import { APP_VERSION } from './appVersion';
import JSZip from 'jszip';

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

export interface DetailedProgress {
  phase: 'reading' | 'processing' | 'compressing' | 'complete';
  overallPercent: number;
  currentTable?: string;
  tables: Array<{
    name: string;
    status: 'pending' | 'processing' | 'done';
    current?: number;
    total?: number;
  }>;
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

// Table names in order
const TABLE_NAMES = [
  'entries',
  'attachments', 
  'drafts',
  'biographies',
  'reminders',
  'receipts',
  'receiptItems',
  'discussionSessions',
  'discussionMessages',
  'weeklyInsights',
  'audioTranscripts',
  'attachmentInsights',
  'analysisQueue',
  'scanLogs',
] as const;

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

// Get file extension from MIME type
function getMimeExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/octet-stream': 'bin',
  };
  return map[mimeType] || 'bin';
}

// Last backup date storage
const LAST_BACKUP_KEY = 'daybook-last-backup';
const BACKUP_REMINDER_DISMISSED_KEY = 'daybook-backup-reminder-dismissed';

export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function setLastBackupDate(date: string): void {
  localStorage.setItem(LAST_BACKUP_KEY, date);
  // Clear any dismissed reminder when a backup is made
  localStorage.removeItem(BACKUP_REMINDER_DISMISSED_KEY);
}

export function isBackupReminderDismissed(): boolean {
  return localStorage.getItem(BACKUP_REMINDER_DISMISSED_KEY) === 'true';
}

export function dismissBackupReminder(): void {
  localStorage.setItem(BACKUP_REMINDER_DISMISSED_KEY, 'true');
}

export function shouldShowBackupReminder(): boolean {
  if (isBackupReminderDismissed()) return false;
  
  const lastBackup = getLastBackupDate();
  if (!lastBackup) return true; // Never backed up
  
  const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
  return daysSince >= 14;
}

export function getDaysSinceLastBackup(): number | null {
  const lastBackup = getLastBackupDate();
  if (!lastBackup) return null;
  return Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Estimate backup size (for warning)
 */
export async function estimateBackupSize(): Promise<number> {
  try {
    const attachments = await db.attachments.toArray();
    const drafts = await db.drafts.toArray();
    
    let total = 0;
    for (const att of attachments) {
      total += att.blob.size;
      if (att.thumbnail) total += att.thumbnail.size;
    }
    for (const draft of drafts) {
      for (const att of draft.attachments || []) {
        total += att.blob.size;
        if (att.thumbnail) total += att.thumbnail.size;
      }
    }
    
    // Add ~20% for JSON metadata overhead
    return Math.round(total * 1.2);
  } catch {
    return 0;
  }
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
 * Export to ZIP file with separate files for each table
 * 
 * ZIP Structure Contract:
 * 
 * daybook-backup-YYYY-MM-DD.zip
 * ├── manifest.json              # BackupManifest
 * ├── tables/
 * │   ├── entries.json           # Entry[]
 * │   ├── biographies.json       
 * │   ├── reminders.json         
 * │   ├── receipts.json          
 * │   ├── receiptItems.json      
 * │   ├── discussionSessions.json
 * │   ├── discussionMessages.json
 * │   ├── weeklyInsights.json    
 * │   ├── audioTranscripts.json  
 * │   ├── attachmentInsights.json
 * │   ├── analysisQueue.json     
 * │   ├── scanLogs.json          
 * │   └── drafts.json            # Draft[] with _blobPath references
 * └── media/
 *     ├── attachments.json       # Attachment metadata with _blobPath
 *     ├── att_<id>.<ext>         # Attachment blobs
 *     ├── att_<id>_thumb.<ext>   # Thumbnails
 *     └── draft_<id>_<idx>.<ext> # Draft attachment blobs
 */
export async function exportBackupZip(
  onProgress?: (progress: DetailedProgress) => void
): Promise<Blob> {
  const zip = new JSZip();

  // Initialize progress - use mutable status
  const tableStatuses: Array<{
    name: string;
    status: 'pending' | 'processing' | 'done';
    current?: number;
    total?: number;
  }> = TABLE_NAMES.map(name => ({
    name,
    status: 'pending',
    current: undefined,
    total: undefined,
  }));

  const updateProgress = (phase: DetailedProgress['phase'], percent: number, tableName?: string) => {
    if (onProgress) {
      onProgress({
        phase,
        overallPercent: percent,
        currentTable: tableName,
        tables: tableStatuses,
      });
    }
  };

  const tableCounts: Record<string, number> = {};
  let mediaIndex = 0;

  // Process each table
  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const tableName = TABLE_NAMES[i];
    tableStatuses[i].status = 'processing';
    updateProgress('reading', Math.round((i / TABLE_NAMES.length) * 80), tableName);

    const table = db.table(tableName);
    const rows = await table.toArray();
    tableStatuses[i].total = rows.length;
    tableCounts[tableName] = rows.length;

    // Handle tables with blobs specially
    if (tableName === 'attachments') {
      const metadata: unknown[] = [];
      
      for (let j = 0; j < rows.length; j++) {
        const att = rows[j];
        tableStatuses[i].current = j + 1;
        updateProgress('processing', Math.round((i / TABLE_NAMES.length) * 80 + (j / rows.length) * 5), tableName);
        
        const ext = getMimeExtension(att.mimeType);
        const blobPath = `att_${att.id || j}.${ext}`;
        
        // Store blob as file (using absolute paths for reliability)
        zip.file(`media/${blobPath}`, att.blob);
        
        // Store thumbnail if exists
        let thumbPath: string | undefined;
        if (att.thumbnail) {
          thumbPath = `att_${att.id || j}_thumb.${ext}`;
          zip.file(`media/${thumbPath}`, att.thumbnail);
        }
        
        // Store metadata without blob
        metadata.push({
          ...att,
          blob: undefined,
          thumbnail: undefined,
          _blobPath: blobPath,
          _thumbPath: thumbPath,
        });
        
        mediaIndex++;
      }
      
      zip.file('media/attachments.json', JSON.stringify(metadata, null, 2));
    } else if (tableName === 'drafts') {
      const metadata: unknown[] = [];
      
      for (let j = 0; j < rows.length; j++) {
        const draft = rows[j];
        tableStatuses[i].current = j + 1;
        
        const processedAtts = [];
        for (let k = 0; k < (draft.attachments || []).length; k++) {
          const att = draft.attachments[k];
          const ext = getMimeExtension(att.mimeType);
          const blobPath = `draft_${draft.id}_${k}.${ext}`;
          
          // Use absolute paths for reliability
          zip.file(`media/${blobPath}`, att.blob);
          
          let thumbPath: string | undefined;
          if (att.thumbnail) {
            thumbPath = `draft_${draft.id}_${k}_thumb.${ext}`;
            zip.file(`media/${thumbPath}`, att.thumbnail);
          }
          
          processedAtts.push({
            ...att,
            blob: undefined,
            thumbnail: undefined,
            _blobPath: blobPath,
            _thumbPath: thumbPath,
          });
        }
        
        metadata.push({
          ...draft,
          attachments: processedAtts,
        });
      }
      
      zip.file('tables/drafts.json', JSON.stringify(metadata, null, 2));
    } else {
      // Regular table - just store as JSON (absolute path)
      zip.file(`tables/${tableName}.json`, JSON.stringify(rows, null, 2));
    }

    tableStatuses[i].status = 'done';
    tableStatuses[i].current = rows.length;
  }

  // Create manifest
  const manifest: BackupManifest = {
    dbName: 'DaybookDB',
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tables: tableCounts,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate ZIP
  updateProgress('compressing', 90);
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  updateProgress('complete', 100);
  return zipBlob;
}

/**
 * Validate backup file structure (JSON format)
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
 * Validate ZIP manifest structure
 */
export function validateZipManifest(data: unknown): data is BackupManifest {
  if (!data || typeof data !== 'object') return false;
  
  const manifest = data as Record<string, unknown>;
  if (manifest.dbName !== 'DaybookDB') return false;
  if (typeof manifest.dbVersion !== 'number') return false;
  if (typeof manifest.exportedAt !== 'string') return false;
  
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
 * Get import summary from manifest (for ZIP)
 */
export function getImportSummaryFromManifest(manifest: BackupManifest): ImportSummary {
  return {
    entries: manifest.tables.entries || 0,
    attachments: manifest.tables.attachments || 0,
    drafts: manifest.tables.drafts || 0,
    biographies: manifest.tables.biographies || 0,
    reminders: manifest.tables.reminders || 0,
    receipts: manifest.tables.receipts || 0,
    receiptItems: manifest.tables.receiptItems || 0,
    discussionSessions: manifest.tables.discussionSessions || 0,
    discussionMessages: manifest.tables.discussionMessages || 0,
    weeklyInsights: manifest.tables.weeklyInsights || 0,
    audioTranscripts: manifest.tables.audioTranscripts || 0,
    attachmentInsights: manifest.tables.attachmentInsights || 0,
    analysisQueue: manifest.tables.analysisQueue || 0,
    scanLogs: manifest.tables.scanLogs || 0,
  };
}

/**
 * Import backup into DaybookDB (JSON format)
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
 * Import from ZIP file
 */
export async function importBackupZip(
  zipBlob: Blob,
  options: { wipeExisting: boolean } = { wipeExisting: true },
  onProgress?: (progress: DetailedProgress) => void
): Promise<void> {
  const zip = await JSZip.loadAsync(zipBlob);

  // Read and validate manifest
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup: missing manifest.json');
  }

  const manifestText = await manifestFile.async('text');
  const manifest = JSON.parse(manifestText);

  if (!validateZipManifest(manifest)) {
    throw new Error('Invalid backup: manifest validation failed');
  }

  // Initialize progress - use mutable status
  const tableStatuses: Array<{
    name: string;
    status: 'pending' | 'processing' | 'done';
    current?: number;
    total?: number;
  }> = TABLE_NAMES.map(name => ({
    name,
    status: 'pending',
    current: undefined,
    total: manifest.tables[name] || 0,
  }));

  const updateProgress = (phase: DetailedProgress['phase'], percent: number, tableName?: string) => {
    if (onProgress) {
      onProgress({
        phase,
        overallPercent: percent,
        currentTable: tableName,
        tables: tableStatuses,
      });
    }
  };

  // Wipe existing data if requested
  if (options.wipeExisting) {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  }

  updateProgress('reading', 10);

  // Import each table
  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const tableName = TABLE_NAMES[i];
    tableStatuses[i].status = 'processing';
    updateProgress('processing', 10 + Math.round((i / TABLE_NAMES.length) * 80), tableName);

    if (tableName === 'attachments') {
      // Read attachments metadata from media folder
      const metaFile = zip.file('media/attachments.json');
      if (metaFile) {
        const metaText = await metaFile.async('text');
        const metadata = JSON.parse(metaText);
        
        // Import attachments in chunks to avoid memory issues on mobile
        const CHUNK_SIZE = 50;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attachments: any[] = [];
        
        for (let j = 0; j < metadata.length; j++) {
          const att = metadata[j];
          tableStatuses[i].current = j + 1;
          
          // Read blob file
          const blobFile = zip.file(`media/${att._blobPath}`);
          const blob = blobFile ? await blobFile.async('blob') : new Blob();
          
          // Read thumbnail if exists
          let thumbnail: Blob | undefined;
          if (att._thumbPath) {
            const thumbFile = zip.file(`media/${att._thumbPath}`);
            thumbnail = thumbFile ? await thumbFile.async('blob') : undefined;
          }
          
          // Remove path metadata and add blobs
          const { _blobPath, _thumbPath, ...rest } = att;
          attachments.push({ ...rest, blob, thumbnail });
          
          // Flush chunk to DB to avoid memory exhaustion
          if (attachments.length >= CHUNK_SIZE) {
            await db.attachments.bulkPut(attachments);
            attachments.length = 0; // clear array
          }
        }
        
        // Flush remaining attachments
        if (attachments.length > 0) {
          await db.attachments.bulkPut(attachments);
        }
      }
    } else if (tableName === 'drafts') {
      // Drafts are in tables folder but have media references
      const tableFile = zip.file(`tables/drafts.json`);
      if (tableFile) {
        const tableText = await tableFile.async('text');
        const drafts = JSON.parse(tableText);
        
        // Import drafts in chunks to avoid memory issues on mobile
        const DRAFT_CHUNK_SIZE = 50;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processedDrafts: any[] = [];
        
        for (const draft of drafts) {
          const processedAtts = [];
          for (const att of draft.attachments || []) {
            const blobFile = zip.file(`media/${att._blobPath}`);
            const blob = blobFile ? await blobFile.async('blob') : new Blob();
            
            let thumbnail: Blob | undefined;
            if (att._thumbPath) {
              const thumbFile = zip.file(`media/${att._thumbPath}`);
              thumbnail = thumbFile ? await thumbFile.async('blob') : undefined;
            }
            
            const { _blobPath, _thumbPath, ...rest } = att;
            processedAtts.push({ ...rest, blob, thumbnail });
          }
          
          processedDrafts.push({ ...draft, attachments: processedAtts });
          
          // Flush chunk to DB
          if (processedDrafts.length >= DRAFT_CHUNK_SIZE) {
            await db.drafts.bulkPut(processedDrafts);
            processedDrafts.length = 0;
          }
        }
        
        // Flush remaining drafts
        if (processedDrafts.length > 0) {
          await db.drafts.bulkPut(processedDrafts);
        }
      }
    } else {
      // Regular table
      const tableFile = zip.file(`tables/${tableName}.json`);
      if (tableFile) {
        const tableText = await tableFile.async('text');
        const rows = JSON.parse(tableText);
        
        if (rows.length > 0) {
          const table = db.table(tableName);
          await table.bulkPut(rows);
        }
      }
    }

    tableStatuses[i].status = 'done';
    tableStatuses[i].current = manifest.tables[tableName] || 0;
  }

  updateProgress('complete', 100);
}

/**
 * Download backup as JSON file (legacy)
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
 * Download backup as ZIP file
 */
export function downloadBackupZip(zipBlob: Blob): void {
  const url = URL.createObjectURL(zipBlob);
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `daybook-backup-${date}.zip`;
  
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
 * Read backup file from user selection (supports JSON and ZIP)
 */
export async function readBackupFile(file: File): Promise<{ type: 'json' | 'zip'; data: BackupPayload | Blob; manifest?: BackupManifest }> {
  if (file.name.endsWith('.zip')) {
    // Read ZIP manifest for validation/summary
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    
    if (!manifestFile) {
      throw new Error('Invalid backup: missing manifest.json');
    }
    
    const manifestText = await manifestFile.async('text');
    const manifest = JSON.parse(manifestText);
    
    if (!validateZipManifest(manifest)) {
      throw new Error('Invalid backup: manifest validation failed');
    }
    
    // Return the file as blob for later import
    return { type: 'zip', data: file, manifest };
  } else {
    // JSON file
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!validateBackupManifest(data)) {
            reject(new Error('Invalid backup format'));
            return;
          }
          resolve({ type: 'json', data });
        } catch {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}
