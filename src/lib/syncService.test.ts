import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSyncMeta, syncEntries } from './syncService';

const {
  mockGetSession,
  mockFrom,
  mockStorageFrom,
  mockEntriesToArray,
  mockEntriesUpdate,
  mockEntriesAdd,
  mockAttachmentsToArray,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockEntriesToArray: vi.fn(),
  mockEntriesUpdate: vi.fn(),
  mockEntriesAdd: vi.fn(),
  mockAttachmentsToArray: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
    storage: { from: mockStorageFrom },
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

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  then: (onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) => Promise<any>;
};

function createQueryBuilder(data: unknown[] = []): QueryBuilder {
  const builder: QueryBuilder = {
    select: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    is: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
  };

  builder.select.mockImplementation(() => builder);
  builder.upsert.mockImplementation(() => builder);
  builder.update.mockImplementation(() => builder);
  builder.eq.mockImplementation(() => builder);
  builder.gte.mockImplementation(() => builder);
  builder.is.mockImplementation(() => builder);

  return builder;
}

describe('syncService', () => {
  let query: QueryBuilder;

  beforeEach(() => {
    localStorage.clear();
    mockGetSession.mockReset();
    mockFrom.mockReset();
    mockStorageFrom.mockReset();
    mockEntriesToArray.mockReset();
    mockEntriesUpdate.mockReset();
    mockEntriesAdd.mockReset();
    mockAttachmentsToArray.mockReset();

    mockEntriesToArray.mockResolvedValue([]);

    query = createQueryBuilder([]);
    mockFrom.mockReturnValue(query);
  });

  it('loadSyncMeta returns defaults when localStorage is empty', () => {
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

    expect(query.upsert).toHaveBeenCalledTimes(1);
    expect(query.upsert.mock.calls[0][0]).toEqual(expect.objectContaining({ local_id: 1 }));
  });
});
