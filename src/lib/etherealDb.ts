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
  id?: number;
  serverId: string;
  roomId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Ethereal task
export interface EtherealTask {
  id?: number;
  serverId: string;
  roomId: string;
  creatorId: string;
  creatorName: string;
  assigneeId?: string;
  assigneeName?: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  dueAtMs?: number;
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
  chronicles!: EntityTable<EtherealChronicle, 'id'>;
  tasks!: EntityTable<EtherealTask, 'id'>;
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
