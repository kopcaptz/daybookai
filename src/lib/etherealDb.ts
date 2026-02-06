/**
 * ETHEREAL DATABASE (IndexedDB via Dexie)
 * =======================================
 *
 * DATA ISOLATION: Completely separate from main app data (DaybookDB)
 *
 * This database stores local copies of Ethereal Layer data:
 * - messages: Chat history (synced from server)
 * - chronicles: Shared notes/documents
 * - tasks: Shared todo items
 * - events: Shared calendar events
 * - members: Cached member info
 *
 * SECURITY NOTES:
 * 1. All data here mirrors server state - source of truth is Supabase
 * 2. Server data is protected by RLS (USING false) + Edge Function proxy
 * 3. Local data is protected by browser same-origin policy
 * 4. clearEtherealData() removes all local data on session end
 *
 * This separation ensures Ethereal Layer data never mixes with
 * personal diary entries in the main application database.
 *
 * SCHEMA HISTORY:
 * - v1: Original schema with auto-increment IDs
 * - v2: Messages with serverId as primary key (deduplication fix)
 * - v3: Added image fields to messages
 * - v4: Chronicles with serverId as primary key
 * - v5-v6: Tasks table recreation with serverId as primary key
 *
 * @see src/lib/db.ts - Main application database (DaybookDB)
 * @see src/lib/etherealTokenService.ts - Session management
 */

import Dexie, { type EntityTable } from 'dexie';

// Ethereal message stored locally
export interface EtherealMessage {
  serverId: string; // PRIMARY KEY
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAtMs: number;
  syncStatus: 'synced' | 'failed';
  // Image fields (Phase 1)
  imagePath?: string;    // stable path: roomId/msgId.jpg
  imageUrl?: string;     // transient signed URL (30 min TTL)
  imageMime?: string;
  imageW?: number;
  imageH?: number;
}

// Ethereal chronicle entry
export interface EtherealChronicle {
  serverId: string; // PRIMARY KEY
  roomId: string;
  authorId: string;
  authorName: string;
  updatedById?: string;
  updatedByName?: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  media: Array<{ path: string; mime: string; signedUrl?: string; w?: number; h?: number; kind: 'image' | 'audio' }>;
  editingBy?: string;
  editingByName?: string;
  editingExpiresAt?: number;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Ethereal task (v1.0: serverId as primary key)
export interface EtherealTask {
  serverId: string;       // PRIMARY KEY
  roomId: string;
  creatorId: string;
  creatorName: string;
  assigneeId?: string;
  assigneeName?: string;
  title: string;
  description?: string;
  status: 'todo' | 'done';           // v1.0: only 2 statuses
  priority: 'normal' | 'urgent';
  dueAtMs?: number;
  completedAtMs?: number;
  completedByName?: string;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Ethereal calendar event
export interface EtherealEvent {
  id?: number;
  serverId: string;
  roomId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description?: string;
  startAtMs: number;
  endAtMs?: number;
  allDay: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Ethereal member cache
export interface EtherealMember {
  id: string;
  roomId: string;
  displayName: string;
  joinedAtMs: number;
  lastSeenAtMs: number;
  isOwner: boolean;
}

// Settings
export interface EtherealSettings {
  key: string;
  value: string;
}

// Stable sort: by createdAtMs, then by serverId as tie-breaker
export function stableMsgSort(a: EtherealMessage, b: EtherealMessage): number {
  if (a.createdAtMs !== b.createdAtMs) {
    return a.createdAtMs - b.createdAtMs;
  }
  return a.serverId.localeCompare(b.serverId);
}

class EtherealDatabase extends Dexie {
  messages!: EntityTable<EtherealMessage, 'serverId'>;
  chronicles!: EntityTable<EtherealChronicle, 'serverId'>;
  tasks!: EntityTable<EtherealTask, 'serverId'>;
  events!: EntityTable<EtherealEvent, 'id'>;
  members!: EntityTable<EtherealMember, 'id'>;
  settings!: EntityTable<EtherealSettings, 'key'>;

  constructor() {
    super('MagicNotebookEtherealDB');

    // v1 - original schema with auto-increment id
    this.version(1).stores({
      messages: '++id, serverId, roomId, createdAtMs, [roomId+createdAtMs]',
      chronicles: '++id, serverId, roomId, createdAtMs',
      tasks: '++id, serverId, roomId, status, dueAtMs',
      events: '++id, serverId, roomId, startAtMs',
      members: 'id, roomId, joinedAtMs',
      settings: 'key',
    });

    // v2 - serverId as primary key for messages (deduplication fix)
    this.version(2)
      .stores({
        messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
        chronicles: '++id, serverId, roomId, createdAtMs',
        tasks: '++id, serverId, roomId, status, dueAtMs',
        events: '++id, serverId, roomId, startAtMs',
        members: 'id, roomId, joinedAtMs',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const oldMessages = await tx.table('messages').toArray();

        // Safe timestamp parsing
        const safeParseMs = (v: any): number => {
          const ms = new Date(v).getTime();
          return Number.isFinite(ms) ? ms : 0;
        };

        // Normalize timestamps from various formats
        const getTimestamp = (m: any): number => {
          if (typeof m.createdAtMs === 'number') return m.createdAtMs;
          if (m.createdAt) return safeParseMs(m.createdAt);
          if (m.created_at) return safeParseMs(m.created_at);
          return 0;
        };

        const byServerId = new Map<string, any>();

        for (let i = 0; i < oldMessages.length; i++) {
          const msg: any = oldMessages[i];

          // 1) Legacy serverId (deterministic) - preserve messages without serverId
          const legacyIdPart = msg.id ?? i;
          const serverId = msg.serverId || `legacy-${legacyIdPart}`;

          // 2) Normalize time once
          const msgTime = getTimestamp(msg);

          const existing = byServerId.get(serverId);
          const existingTime = existing ? (existing.createdAtMs ?? getTimestamp(existing)) : 0;

          // Keep newest
          if (!existing || msgTime > existingTime) {
            const { id, ...rest } = msg;

            byServerId.set(serverId, {
              ...rest,
              serverId,
              createdAtMs: msgTime,
              // 3) syncStatus default - never undefined
              syncStatus: rest.syncStatus === 'failed' ? 'failed' : 'synced',
            });
          }
        }

        await tx.table('messages').clear();

        const deduplicated = [...byServerId.values()];
        if (deduplicated.length > 0) {
          await tx.table('messages').bulkPut(deduplicated);
        }
      });

    // v3 - add image fields (no schema change needed, just optional new columns)
    this.version(3).stores({
      messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
      chronicles: '++id, serverId, roomId, createdAtMs',
      tasks: '++id, serverId, roomId, status, dueAtMs',
      events: '++id, serverId, roomId, startAtMs',
      members: 'id, roomId, joinedAtMs',
      settings: 'key',
    });

    // v4 - chronicles with serverId as primary key (same pattern as messages)
    this.version(4)
      .stores({
        messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
        chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]',
        tasks: '++id, serverId, roomId, status, dueAtMs',
        events: '++id, serverId, roomId, startAtMs',
        members: 'id, roomId, joinedAtMs',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const oldChronicles = await tx.table('chronicles').toArray();
        
        // Migrate old chronicles to new format
        const byServerId = new Map<string, EtherealChronicle>();
        
        for (let i = 0; i < oldChronicles.length; i++) {
          // deno-lint-ignore no-explicit-any
          const c: any = oldChronicles[i];
          const serverId = c.serverId || `legacy-${c.id ?? i}`;
          
          if (!byServerId.has(serverId)) {
            byServerId.set(serverId, {
              serverId,
              roomId: c.roomId,
              authorId: c.authorId,
              authorName: c.authorName || 'Unknown',
              title: c.title || '',
              content: c.content || '',
              tags: c.tags || [],
              pinned: c.pinned || false,
              media: c.media || [],
              createdAtMs: c.createdAtMs || Date.now(),
              updatedAtMs: c.updatedAtMs || Date.now(),
              syncStatus: 'synced',
            });
          }
        }
        
        await tx.table('chronicles').clear();
        
        const migrated = [...byServerId.values()];
        if (migrated.length > 0) {
          await tx.table('chronicles').bulkPut(migrated);
        }
      });

    // v5 - DELETE old tasks table (required to change primary key)
    // Dexie doesn't support changing primary key, so we delete and recreate
    this.version(5).stores({
      messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
      chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]',
      tasks: null,  // DELETE the table
      events: '++id, serverId, roomId, startAtMs',
      members: 'id, roomId, joinedAtMs',
      settings: 'key',
    });

    // v6 - CREATE new tasks table with serverId as primary key
    this.version(6).stores({
      messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
      chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]',
      tasks: 'serverId, roomId, status, dueAtMs, updatedAtMs, [roomId+status]',
      events: '++id, serverId, roomId, startAtMs',
      members: 'id, roomId, joinedAtMs',
      settings: 'key',
    });
  }
}

export const etherealDb = new EtherealDatabase();

// Helper to merge messages from server (upsert by serverId)
export async function mergeMessages(
  roomId: string,
  serverMessages: Array<{
    serverId: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAtMs: number;
  }>
): Promise<EtherealMessage[]> {
  if (serverMessages.length > 0) {
    // Prepare messages for upsert
    const toUpsert: EtherealMessage[] = serverMessages.map((msg) => ({
      ...msg,
      roomId,
      syncStatus: 'synced' as const,
    }));

    // bulkPut = upsert by primary key (serverId)
    await etherealDb.messages.bulkPut(toUpsert);
  }

  // Return all messages sorted with stable sort
  const all = await etherealDb.messages.where('roomId').equals(roomId).toArray();
  return all.sort(stableMsgSort);
}

// Clear all ethereal data (for logout)
export async function clearEtherealData(): Promise<void> {
  await Promise.all([
    etherealDb.messages.clear(),
    etherealDb.chronicles.clear(),
    etherealDb.tasks.clear(),
    etherealDb.events.clear(),
    etherealDb.members.clear(),
    etherealDb.settings.clear(),
  ]);
}
