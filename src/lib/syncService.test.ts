import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSyncMeta, syncEntries } from './syncService';

const {
  mockGetSession,
  mockFrom,
  mockEntriesToArray,
  mockEntriesUpdate,
  mockEntriesAdd,
  mockAttachmentsToArray,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockEntriesToArray: vi.fn(),
  mockEntriesUpdate: vi.fn(),
  mockEntriesAdd: vi.fn(),
  mockAttachmentsToArray: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: vi.fn() },
  },
}));

vi.mock('./db', () => ({
  db: {
    entries: {
      toArray: mockEntriesToArray,
      update: mockEntriesUpdate,
      add: mockEntriesAdd,
    },
    attachments: {
      toArray: mockAttachmentsToArray,
    },
  },
}));

function makeQuery(data: unknown[] = []) {
  return {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: (onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) =>
      Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
  };
}

describe('syncService', () => {
  let mockUpsert: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    mockGetSession.mockReset();
    mockFrom.mockReset();
    mockEntriesToArray.mockReset();
    mockEntriesUpdate.mockReset();
    mockEntriesAdd.mockReset();
    mockAttachmentsToArray.mockReset();

    mockUpsert = vi.fn().mockResolvedValue({ error: null });
    mockSelect = vi.fn(() => makeQuery([]));
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
      update: mockUpdate,
    });
  });

  it('loadSyncMeta returns defaults when storage is empty', () => {
    const meta = loadSyncMeta();
    expect(meta).toEqual({ lastSyncedAt: null, pendingCount: 0 });
  });

  it('syncEntries throws error without authentication', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(syncEntries()).rejects.toThrow('Not authenticated');
  });

  it('does not sync private entries by default', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    mockEntriesToArray.mockResolvedValue([
      {
        id: 1,
        date: '2026-02-07',
        text: 'Public entry',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 2,
        date: '2026-02-07',
        text: 'Private entry',
        mood: 3,
        tags: [],
        isPrivate: true,
        aiAllowed: false,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await syncEntries();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({ local_id: 1 }));
  });
});
