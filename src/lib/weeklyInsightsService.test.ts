import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from './db';

const {
  mockEntriesToArray,
  mockTableGet,
  mockTablePut,
  mockLoadAISettings,
} = vi.hoisted(() => ({
  mockEntriesToArray: vi.fn(),
  mockTableGet: vi.fn(),
  mockTablePut: vi.fn(),
  mockLoadAISettings: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    entries: {
      where: vi.fn(() => ({
        between: vi.fn(() => ({
          toArray: mockEntriesToArray,
        })),
      })),
    },
    table: vi.fn(() => ({
      get: mockTableGet,
      put: mockTablePut,
    })),
  },
}));

vi.mock('./aiConfig', () => ({
  loadAISettings: mockLoadAISettings,
  getModelForProfile: vi.fn(() => 'test-model'),
}));

vi.mock('./aiUtils', () => ({
  getAITokenHeader: vi.fn(() => ({ Authorization: 'Bearer test' })),
}));

vi.mock('./i18n', () => ({
  getBaseLanguage: vi.fn((lang: string) => lang === 'ru-RU' ? 'ru' : lang),
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateWeeklyInsight } from './weeklyInsightsService';

function makeEntry(overrides: Partial<DiaryEntry> & Pick<DiaryEntry, 'id' | 'date'>): DiaryEntry {
  return {
    id: overrides.id,
    date: overrides.date,
    text: overrides.text ?? 'Some entry text content for the week',
    mood: overrides.mood ?? 3,
    tags: overrides.tags ?? [],
    isPrivate: overrides.isPrivate ?? false,
    aiAllowed: overrides.aiAllowed ?? true,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    title: overrides.title,
    titleSource: overrides.titleSource,
    moodSource: overrides.moodSource,
    semanticTags: overrides.semanticTags,
    attachmentCounts: overrides.attachmentCounts,
    cloudId: overrides.cloudId,
    syncStatus: overrides.syncStatus,
    lastSyncedAt: overrides.lastSyncedAt,
  };
}

describe('weeklyInsightsService payload framing', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockEntriesToArray.mockReset();
    mockTableGet.mockReset();
    mockTableGet.mockResolvedValue(null);
    mockTablePut.mockReset();
    mockTablePut.mockResolvedValue(undefined);
    mockLoadAISettings.mockReset();
    mockLoadAISettings.mockReturnValue({
      provider: 'lovable',
      strictPrivacy: false,
    });
  });

  function mockSuccessfulApi() {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          summary: 'Weekly summary',
          dominantThemes: ['work', 'rest'],
          moodPattern: 'stable',
          insight: 'Insight text',
          suggestion: 'Suggestion text',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }

  it('includes source metadata for mood and titled entries in the API payload', async () => {
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', mood: 3, moodSource: 'ai', title: 'AI Title', titleSource: 'ai' }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 4, moodSource: 'user', title: undefined, titleSource: undefined }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 5, moodSource: undefined, title: 'Mystery', titleSource: undefined }),
    ]);
    mockSuccessfulApi();

    const result = await generateWeeklyInsight('en');
    expect(result.success).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(body.entries[0]).toEqual(expect.objectContaining({
      mood: 3,
      moodSource: 'ai',
      title: 'AI Title',
      titleSource: 'ai',
    }));
    expect(body.entries[1]).toEqual(expect.objectContaining({
      mood: 4,
      moodSource: 'user',
    }));
    expect(body.entries[1]).not.toHaveProperty('titleSource');
    expect(body.entries[2]).toEqual(expect.objectContaining({
      mood: 5,
      moodSource: 'unknown',
      title: 'Mystery',
      titleSource: 'unknown',
    }));
  });

  it('forwards AI-generated titles with titleSource=ai so they are not bare authored titles', async () => {
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', mood: 3, title: 'Sigil of Sunday', titleSource: 'ai' }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 4, title: undefined, titleSource: undefined }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 5, title: 'Weekend Recap', titleSource: 'ai' }),
    ]);
    mockSuccessfulApi();

    await generateWeeklyInsight('en');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const titles = body.entries.map((e: any) => e.title);

    expect(titles).toContain('Sigil of Sunday');
    expect(titles).toContain('Weekend Recap');

    expect(body.entries[0].titleSource).toBe('ai');
    expect(body.entries[2].titleSource).toBe('ai');
  });

  it('strict privacy strips text but keeps AI-derived titles source-framed', async () => {
    mockLoadAISettings.mockReturnValue({ provider: 'lovable', strictPrivacy: true });
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', mood: 3, title: 'AI Title 1', titleSource: 'ai', text: 'private content one' }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 4, title: 'AI Title 2', titleSource: 'ai', text: 'private content two' }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 5, title: 'AI Title 3', titleSource: 'ai', text: 'private content three' }),
    ]);
    mockSuccessfulApi();

    await generateWeeklyInsight('en');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    for (const entry of body.entries) {
      expect(entry).not.toHaveProperty('text');
      expect(entry.title).toBeDefined();
      expect(entry.titleSource).toBe('ai');
    }
  });

  it('sends mood with an explicit moodSource flag', async () => {
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', mood: 1, moodSource: 'ai' }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 5, moodSource: 'user' }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 3, moodSource: undefined }),
    ]);
    mockSuccessfulApi();

    await generateWeeklyInsight('en');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.entries.map((e: any) => e.mood)).toEqual([1, 5, 3]);
    expect(body.entries.map((e: any) => e.moodSource)).toEqual(['ai', 'user', 'unknown']);
  });

  it('drops title=null entries from being sent (uses `e.title || undefined` truthy check)', async () => {
    // db migration v13 sets entry.title=null for legacy entries. The current
    // payload uses `title: e.title || undefined` which collapses null to
    // undefined. This test pins that behavior so any change in the predicate
    // (e.g. switching to e.titleSource === 'user') is conscious.
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', mood: 3, title: null as unknown as string, titleSource: undefined }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 3, title: '', titleSource: undefined }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 3, title: 'Real title', titleSource: 'ai' }),
    ]);
    mockSuccessfulApi();

    await generateWeeklyInsight('en');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.entries[0].title).toBeUndefined();
    expect(body.entries[0].titleSource).toBeUndefined();
    expect(body.entries[1].title).toBeUndefined();
    expect(body.entries[1].titleSource).toBeUndefined();
    expect(body.entries[2].title).toBe('Real title');
    expect(body.entries[2].titleSource).toBe('ai');
  });

  it('refuses to generate when fewer than 3 eligible entries are available', async () => {
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01' }),
      makeEntry({ id: 2, date: '2026-04-02' }),
    ]);

    const result = await generateWeeklyInsight('en');

    expect(result).toEqual({ success: false, error: 'not_enough_entries' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters out private entries before counting eligibility (private mood/title never reach the payload)', async () => {
    mockEntriesToArray.mockResolvedValue([
      makeEntry({ id: 1, date: '2026-04-01', isPrivate: true, aiAllowed: false, mood: 1, title: 'Private title' }),
      makeEntry({ id: 2, date: '2026-04-02', mood: 4 }),
      makeEntry({ id: 3, date: '2026-04-03', mood: 5 }),
    ]);

    // Only 2 eligible → not_enough_entries, no fetch.
    const result = await generateWeeklyInsight('en');
    expect(result).toEqual({ success: false, error: 'not_enough_entries' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
