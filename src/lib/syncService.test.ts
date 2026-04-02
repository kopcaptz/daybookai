import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_SWITCH_BLOCKED, loadSyncMeta, syncEntries } from './syncService';

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
    mockEntriesToArray.mockResolvedValue([]);

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

  it('loadSyncMeta uses user-specific storage key when user is provided', () => {
    localStorage.setItem(
      'daybook-sync-meta:user-123',
      JSON.stringify({ lastSyncedAt: '2026-01-01T00:00:00.000Z', pendingCount: 0 })
    );

    const meta = loadSyncMeta('user-123');
    expect(meta).toEqual({ lastSyncedAt: '2026-01-01T00:00:00.000Z', pendingCount: 0 });
  });

  it('loadSyncMeta with user id ignores legacy global meta when owner is missing', () => {
    localStorage.setItem(
      'daybook-sync-meta',
      JSON.stringify({ lastSyncedAt: '2026-01-02T00:00:00.000Z', pendingCount: 3 })
    );

    const scopedMeta = loadSyncMeta('user-123');
    const legacyMeta = loadSyncMeta();

    expect(scopedMeta).toEqual({ lastSyncedAt: null, pendingCount: 0 });
    expect(legacyMeta).toEqual({ lastSyncedAt: '2026-01-02T00:00:00.000Z', pendingCount: 3 });
  });

  it('syncEntries throws error without authentication', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(syncEntries()).rejects.toThrow('Not authenticated');
  });

  it('does not bind sync owner after successful empty sync on an unbound device', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    const result = await syncEntries();

    expect(result.errors).toEqual([]);
    expect(localStorage.getItem('daybook-sync-owner-user-id')).toBeNull();
  });

  it('allows sync when signed in user matches bound sync owner', async () => {
    localStorage.setItem('daybook-sync-owner-user-id', 'user-123');
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    const result = await syncEntries();

    expect(result.errors).toEqual([]);
    expect(localStorage.getItem('daybook-sync-owner-user-id')).toBe('user-123');
  });

  it('blocks sync when signed in user differs from bound sync owner', async () => {
    localStorage.setItem('daybook-sync-owner-user-id', 'user-owner');
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });

    await expect(syncEntries()).rejects.toThrow(ACCOUNT_SWITCH_BLOCKED);
  });

  it('binds owner after successfully verifying existing eligible local entries', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
    });
    mockSelect.mockImplementation(() => makeQuery([
      {
        local_id: 1,
        updated_at: new Date(2).toISOString(),
      },
    ]));
    mockEntriesToArray.mockResolvedValue([
      {
        id: 1,
        date: '2026-02-07',
        text: 'Verified entry',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const result = await syncEntries();

    expect(result.errors).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockEntriesAdd).not.toHaveBeenCalled();
    expect(localStorage.getItem('daybook-sync-owner-user-id')).toBe('user-123');
  });

  it('binds owner after successfully syncing eligible local entries and still skips private entries by default', async () => {
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
    expect(localStorage.getItem('daybook-sync-owner-user-id')).toBe('user-123');
  });
});
