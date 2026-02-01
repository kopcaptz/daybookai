import Dexie, { type EntityTable } from 'dexie';

// Ethereal message stored locally
export interface EtherealMessage {
  id?: number;
  serverId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAtMs: number;
  syncStatus: 'pending' | 'synced';
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

class EtherealDatabase extends Dexie {
  messages!: EntityTable<EtherealMessage, 'id'>;
  chronicles!: EntityTable<EtherealChronicle, 'id'>;
  tasks!: EntityTable<EtherealTask, 'id'>;
  events!: EntityTable<EtherealEvent, 'id'>;
  members!: EntityTable<EtherealMember, 'id'>;
  settings!: EntityTable<EtherealSettings, 'key'>;

  constructor() {
    super('MagicNotebookEtherealDB');

    this.version(1).stores({
      messages: '++id, serverId, roomId, createdAtMs, [roomId+createdAtMs]',
      chronicles: '++id, serverId, roomId, createdAtMs',
      tasks: '++id, serverId, roomId, status, dueAtMs',
      events: '++id, serverId, roomId, startAtMs',
      members: 'id, roomId, joinedAtMs',
      settings: 'key',
    });
  }
}

export const etherealDb = new EtherealDatabase();

// Helper to merge messages from server
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
  // Get existing messages for this room
  const existing = await etherealDb.messages
    .where('roomId')
    .equals(roomId)
    .toArray();

  const existingByServerId = new Map(existing.map((m) => [m.serverId, m]));

  // Merge: add new messages, skip duplicates
  const toAdd: EtherealMessage[] = [];
  for (const msg of serverMessages) {
    if (!existingByServerId.has(msg.serverId)) {
      toAdd.push({
        ...msg,
        roomId,
        syncStatus: 'synced',
      });
    }
  }

  if (toAdd.length > 0) {
    await etherealDb.messages.bulkAdd(toAdd);
  }

  // Return all messages sorted
  const all = await etherealDb.messages
    .where('roomId')
    .equals(roomId)
    .toArray();

  return all.sort((a, b) => a.createdAtMs - b.createdAtMs);
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
