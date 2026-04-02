import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, StoredBiography } from '@/lib/db';

const mockState = vi.hoisted(() => ({
  entries: new Map<number, DiaryEntry>(),
  biographies: new Map<string, StoredBiography>(),
  attachmentCounts: new Map<number, number>(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    entries: {
      get: vi.fn(async (id: number) => mockState.entries.get(id)),
      toArray: vi.fn(async () => Array.from(mockState.entries.values())),
    },
    attachments: {
      where: vi.fn(() => ({
        equals: vi.fn((entryId: number) => ({
          count: vi.fn(async () => mockState.attachmentCounts.get(entryId) ?? 0),
        })),
      })),
    },
    biographies: {
      get: vi.fn(async (date: string) => mockState.biographies.get(date)),
      toArray: vi.fn(async () => Array.from(mockState.biographies.values())),
    },
  },
  hasLiveDiscussionAuthority: (scope: { entryIds: number[] }) => scope.entryIds.length > 0,
}));

import { buildContextPack, getScopeCountText } from './contextPack';

function makeEntry(overrides: Partial<DiaryEntry> & Pick<DiaryEntry, 'id' | 'date' | 'text' | 'createdAt'>): DiaryEntry {
  return {
    id: overrides.id,
    date: overrides.date,
    text: overrides.text,
    mood: overrides.mood ?? 3,
    tags: overrides.tags ?? [],
    isPrivate: overrides.isPrivate ?? false,
    aiAllowed: overrides.aiAllowed ?? true,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt ?? overrides.createdAt,
    semanticTags: overrides.semanticTags ?? [],
    attachmentCounts: overrides.attachmentCounts,
    moodSource: overrides.moodSource,
    aiAnalyzedAt: overrides.aiAnalyzedAt,
    title: overrides.title,
    titleSource: overrides.titleSource,
    cloudId: overrides.cloudId,
    syncStatus: overrides.syncStatus,
    lastSyncedAt: overrides.lastSyncedAt,
  };
}

function makeBiography(
  date: string,
  sourceEntryIds: number[],
  title: string,
  narrative: string
): StoredBiography {
  return {
    date,
    generatedAt: 1,
    status: 'complete',
    retryCount: 0,
    biography: {
      title,
      narrative,
      highlights: ['h1', 'h2', 'h3'],
      timeline: [],
    },
    sourceEntryIds,
  };
}

describe('buildContextPack', () => {
  beforeEach(() => {
    mockState.entries.clear();
    mockState.biographies.clear();
    mockState.attachmentCounts.clear();
  });

  it('keeps scoped findMode from pulling out-of-scope entries', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-04-01',
      text: 'Scoped work note',
      createdAt: 100,
    }));
    mockState.entries.set(2, makeEntry({
      id: 2,
      date: '2026-04-01',
      text: 'Another scoped thought',
      createdAt: 200,
    }));
    mockState.entries.set(99, makeEntry({
      id: 99,
      date: '2026-04-02',
      text: 'Vacation keyword outside scope',
      createdAt: 300,
    }));

    const result = await buildContextPack({
      sessionScope: { entryIds: [1, 2], docIds: [] },
      userQuery: 'vacation',
      mode: 'discuss',
      findMode: true,
    });

    const entryIds = result.evidence
      .filter(evidence => evidence.type === 'entry')
      .map(evidence => evidence.entityId)
      .sort((a, b) => a - b);

    expect(entryIds).toEqual([1, 2]);
    expect(entryIds).not.toContain(99);
  });

  it('keeps scoped findMode ranking inside the scoped entries only', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-04-01',
      text: 'General status note',
      createdAt: 500,
    }));
    mockState.entries.set(2, makeEntry({
      id: 2,
      date: '2026-03-31',
      text: 'Focus topic appears here',
      createdAt: 100,
    }));
    mockState.entries.set(99, makeEntry({
      id: 99,
      date: '2026-04-02',
      text: 'Focus topic outside the discussion scope',
      createdAt: 900,
    }));

    const result = await buildContextPack({
      sessionScope: { entryIds: [1, 2], docIds: [] },
      userQuery: 'focus',
      mode: 'discuss',
      findMode: true,
    });

    const entryIds = result.evidence
      .filter(evidence => evidence.type === 'entry')
      .map(evidence => evidence.entityId);

    expect(entryIds[0]).toBe(2);
    expect(entryIds).toEqual([2, 1]);
  });

  it('keeps empty-scope findMode global discovery', async () => {
    mockState.entries.set(99, makeEntry({
      id: 99,
      date: '2026-04-02',
      text: 'Moonlight discovery note',
      createdAt: 300,
      semanticTags: ['moonlight'],
    }));

    const result = await buildContextPack({
      sessionScope: { entryIds: [], docIds: [] },
      userQuery: 'moonlight',
      mode: 'discuss',
      findMode: true,
    });

    const entryIds = result.evidence
      .filter(evidence => evidence.type === 'entry')
      .map(evidence => evidence.entityId);

    expect(entryIds).toEqual([99]);
  });

  it('treats docs-only scope as lacking live authority for global discovery', async () => {
    mockState.entries.set(99, makeEntry({
      id: 99,
      date: '2026-04-02',
      text: 'Moonlight discovery note',
      createdAt: 300,
      semanticTags: ['moonlight'],
    }));

    const result = await buildContextPack({
      sessionScope: { entryIds: [], docIds: [9] },
      userQuery: 'moonlight',
      mode: 'discuss',
      findMode: true,
    });

    const entryIds = result.evidence
      .filter(evidence => evidence.type === 'entry')
      .map(evidence => evidence.entityId);

    expect(entryIds).toEqual([99]);
  });

  it('keeps empty-scope findMode fallback to recent entries when nothing matches', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-03-31',
      text: 'Older note',
      createdAt: 100,
    }));
    mockState.entries.set(2, makeEntry({
      id: 2,
      date: '2026-04-02',
      text: 'Newest note',
      createdAt: 500,
    }));

    const result = await buildContextPack({
      sessionScope: { entryIds: [], docIds: [] },
      userQuery: 'no-such-keyword',
      mode: 'discuss',
      findMode: true,
    });

    const entryIds = result.evidence
      .filter(evidence => evidence.type === 'entry')
      .map(evidence => evidence.entityId);

    expect(entryIds).toEqual([2, 1]);
  });

  it('prevents scoped findMode from injecting out-of-scope biographies', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-04-01',
      text: 'Scoped reflection',
      createdAt: 100,
    }));
    mockState.biographies.set(
      '2026-04-01',
      makeBiography('2026-04-01', [1], 'Scoped day', 'Routine scoped narrative')
    );
    mockState.biographies.set(
      '2026-04-02',
      makeBiography('2026-04-02', [99], 'Breakthrough day', 'Breakthrough keyword outside scope')
    );

    const result = await buildContextPack({
      sessionScope: { entryIds: [1], docIds: [] },
      userQuery: 'breakthrough',
      mode: 'discuss',
      findMode: true,
    });

    const biographyDates = result.evidence
      .filter(evidence => evidence.type === 'biography')
      .map(evidence => evidence.biographyDate);

    expect(biographyDates).toEqual(['2026-04-01']);
    expect(biographyDates).not.toContain('2026-04-02');
  });

  it('prevents scoped non-findMode from injecting globally matched out-of-scope biographies', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-04-01',
      text: 'Scoped reflection',
      createdAt: 100,
    }));
    mockState.biographies.set(
      '2026-04-01',
      makeBiography('2026-04-01', [1], 'Scoped day', 'Routine scoped narrative')
    );
    mockState.biographies.set(
      '2026-04-02',
      makeBiography('2026-04-02', [99], 'Breakthrough day', 'Breakthrough keyword outside scope')
    );

    const result = await buildContextPack({
      sessionScope: { entryIds: [1], docIds: [] },
      userQuery: 'breakthrough',
      mode: 'discuss',
      findMode: false,
    });

    const biographyDates = result.evidence
      .filter(evidence => evidence.type === 'biography')
      .map(evidence => evidence.biographyDate);

    expect(biographyDates).toEqual(['2026-04-01']);
    expect(biographyDates).not.toContain('2026-04-02');
  });

  it('excludes same-date biographies whose source entries exceed the live scope', async () => {
    mockState.entries.set(1, makeEntry({
      id: 1,
      date: '2026-04-01',
      text: 'Scoped reflection',
      createdAt: 100,
    }));
    mockState.biographies.set(
      '2026-04-01',
      makeBiography('2026-04-01', [1, 2], 'Broader day', 'Biography built from a wider day scope')
    );

    const result = await buildContextPack({
      sessionScope: { entryIds: [1], docIds: [] },
      userQuery: 'broader',
      mode: 'discuss',
      findMode: false,
    });

    const biographyDates = result.evidence
      .filter(evidence => evidence.type === 'biography')
      .map(evidence => evidence.biographyDate);

    expect(biographyDates).toEqual([]);
  });

  it('keeps no-live-authority biography keyword expansion available', async () => {
    mockState.biographies.set(
      '2026-04-02',
      makeBiography('2026-04-02', [99], 'Breakthrough day', 'Breakthrough keyword outside scope')
    );

    const result = await buildContextPack({
      sessionScope: { entryIds: [], docIds: [] },
      userQuery: 'breakthrough',
      mode: 'discuss',
      findMode: true,
    });

    const biographyDates = result.evidence
      .filter(evidence => evidence.type === 'biography')
      .map(evidence => evidence.biographyDate);

    expect(biographyDates).toEqual(['2026-04-02']);
  });
});

describe('getScopeCountText', () => {
  it('treats docs-only stored shape as no active scope', () => {
    expect(getScopeCountText([], [9], 'en')).toBe('No sources');
  });

  it('shows only entry-backed live authority when docs are also stored', () => {
    expect(getScopeCountText([1, 2], [9], 'en')).toBe('2 entries');
  });
});
