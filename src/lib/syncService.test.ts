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

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

function makeQueryWithError(errorMsg: string) {
  return {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: (onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) =>
      Promise.resolve({ data: null, error: { message: errorMsg } }).then(onFulfilled, onRejected),
  };
}

describe('syncService', () => {
  let mockUpsert: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockUpdate: ReturnType<typeof vi.fn>;

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
    mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
      update: mockUpdate,
    });
  });

  // ===== Original 3 tests =====

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

  // ===== New tests =====

  it('LWW: pushes to server when local entry is newer', async () => {
    localStorage.setItem(
      'daybook-sync-meta',
      JSON.stringify({ lastSyncedAt: '2020-01-01T00:00:00.000Z', pendingCount: 0 }),
    );

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    const serverEntry = {
      id: 'server-uuid-10',
      local_id: 10,
      user_id: 'user-123',
      updated_at: '1970-01-01T00:00:01.000Z', // 1000 ms
    };

    mockEntriesToArray.mockResolvedValue([
      {
        id: 10,
        date: '2026-01-01',
        text: 'Local newer',
        mood: 4,
        tags: ['test'],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 500,
        updatedAt: 2000,
      },
    ]);

    mockSelect.mockImplementation(() => makeQuery([serverEntry]));

    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: updateEqMock });

    const result = await syncEntries();

    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('LWW: pulls from server when server entry is newer', async () => {
    localStorage.setItem(
      'daybook-sync-meta',
      JSON.stringify({ lastSyncedAt: '2020-01-01T00:00:00.000Z', pendingCount: 0 }),
    );

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    const serverEntry = {
      id: 'server-uuid-20',
      local_id: 20,
      user_id: 'user-123',
      text: 'Updated from cloud',
      mood: 5,
      tags: ['cloud'],
      is_private: false,
      title: null,
      title_source: null,
      mood_source: 'user',
      semantic_tags: [],
      attachment_counts: { image: 0, video: 0, audio: 0 },
      updated_at: '1970-01-01T00:00:02.000Z', // 2000 ms
      created_at: '1970-01-01T00:00:00.500Z',
    };

    mockEntriesToArray.mockResolvedValue([
      {
        id: 20,
        date: '2026-01-01',
        text: 'Old local',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 500,
        updatedAt: 1000,
      },
    ]);

    mockSelect.mockImplementation(() => makeQuery([serverEntry]));

    const result = await syncEntries();

    expect(result.downloaded).toBe(1);
    expect(mockEntriesUpdate).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ text: 'Updated from cloud', mood: 5 }),
    );
  });

  it('equal timestamps cause neither upload nor download', async () => {
    localStorage.setItem(
      'daybook-sync-meta',
      JSON.stringify({ lastSyncedAt: '2020-01-01T00:00:00.000Z', pendingCount: 0 }),
    );

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    const serverEntry = {
      id: 'server-uuid-30',
      local_id: 30,
      user_id: 'user-123',
      updated_at: '1970-01-01T00:00:01.000Z', // exactly 1000 ms
    };

    mockEntriesToArray.mockResolvedValue([
      {
        id: 30,
        date: '2026-01-01',
        text: 'Same time',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 500,
        updatedAt: 1000,
      },
    ]);

    mockSelect.mockImplementation(() => makeQuery([serverEntry]));

    const result = await syncEntries();

    expect(result.uploaded).toBe(0);
    expect(result.downloaded).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockEntriesUpdate).not.toHaveBeenCalled();
  });

  it('first sync downloads entries from other devices', async () => {
    // No daybook-sync-meta → lastSyncedAt is null → triggers second full-download query
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    mockEntriesToArray.mockResolvedValue([]);
    mockEntriesAdd.mockResolvedValue(100);

    const otherDeviceEntries = [
      {
        local_id: 100,
        user_id: 'user-123',
        date: '2026-01-10',
        text: 'From tablet',
        mood: 4,
        tags: ['tablet'],
        is_private: false,
        title: null,
        title_source: null,
        mood_source: 'user',
        semantic_tags: [],
        attachment_counts: { image: 0, video: 0, audio: 0 },
        created_at: '2026-01-10T10:00:00.000Z',
        updated_at: '2026-01-10T10:00:00.000Z',
        deleted_at: null,
      },
      {
        local_id: 200,
        user_id: 'user-123',
        date: '2026-01-11',
        text: 'From phone',
        mood: 3,
        tags: ['phone'],
        is_private: false,
        title: 'Phone note',
        title_source: 'user',
        mood_source: 'user',
        semantic_tags: [],
        attachment_counts: { image: 1, video: 0, audio: 0 },
        created_at: '2026-01-11T08:00:00.000Z',
        updated_at: '2026-01-11T08:00:00.000Z',
        deleted_at: null,
      },
    ];

    // Track select calls: first returns empty, second returns other-device entries
    let selectCallCount = 0;
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) return makeQuery([]);
        return makeQuery(otherDeviceEntries);
      }),
      upsert: mockUpsert,
      update: mockUpdate,
    }));

    const result = await syncEntries();

    expect(result.downloaded).toBe(2);
    expect(mockEntriesAdd).toHaveBeenCalledTimes(2);
    expect(mockEntriesAdd).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-10', text: 'From tablet' }),
    );
    expect(mockEntriesAdd).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-11', text: 'From phone' }),
    );
  });

  it('syncs private entries when daybook-sync-private is enabled', async () => {
    localStorage.setItem('daybook-sync-private', 'true');

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
        mood: 4,
        tags: [],
        isPrivate: true,
        aiAllowed: false,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    await syncEntries();

    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it('saveSyncMeta persists and loadSyncMeta reads back after sync', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    mockEntriesToArray.mockResolvedValue([]);

    await syncEntries();

    const meta = loadSyncMeta();
    expect(meta.lastSyncedAt).not.toBeNull();
    expect(meta.pendingCount).toBe(0);
  });

  it('collects upsert error in result.errors', async () => {
    localStorage.setItem(
      'daybook-sync-meta',
      JSON.stringify({ lastSyncedAt: '2020-01-01T00:00:00.000Z', pendingCount: 0 }),
    );

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    mockEntriesToArray.mockResolvedValue([
      {
        id: 1,
        date: '2026-02-07',
        text: 'Entry',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    mockUpsert.mockResolvedValue({ error: { message: 'unique_violation' } });

    const result = await syncEntries();

    expect(result.uploaded).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('unique_violation');
  });

  it('catches server fetch error in result.errors', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    mockEntriesToArray.mockResolvedValue([]);
    mockSelect.mockImplementation(() => makeQueryWithError('network_timeout'));

    const result = await syncEntries();

    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some(e => e.includes('network_timeout'))).toBe(true);
  });
});
