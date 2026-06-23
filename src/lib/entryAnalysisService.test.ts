import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, AnalysisQueueItem } from '@/lib/db';

// Hoisted mocks so vi.mock factories can capture them.
const {
  mockEntriesGet,
  mockUpdateEntry,
  mockQueueWhere,
  mockQueueAdd,
  mockQueueUpdate,
  mockQueueDelete,
  mockSupabaseInvoke,
  mockLoadAISettings,
} = vi.hoisted(() => ({
  mockEntriesGet: vi.fn(),
  mockUpdateEntry: vi.fn(),
  mockQueueWhere: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockQueueUpdate: vi.fn(),
  mockQueueDelete: vi.fn(),
  mockSupabaseInvoke: vi.fn(),
  mockLoadAISettings: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    entries: {
      get: mockEntriesGet,
    },
    analysisQueue: {
      where: mockQueueWhere,
      add: mockQueueAdd,
      update: mockQueueUpdate,
      delete: mockQueueDelete,
    },
  },
  updateEntry: mockUpdateEntry,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mockSupabaseInvoke },
  },
}));

vi.mock('@/lib/aiConfig', () => ({
  loadAISettings: mockLoadAISettings,
  getModelForProfile: vi.fn(() => 'test-model'),
}));

vi.mock('@/lib/aiUtils', () => ({
  getAITokenHeader: vi.fn(() => ({ Authorization: 'Bearer test' })),
}));

import {
  analyzeEntryInBackground,
  processAnalysisQueue,
  reanalyzeEntry,
} from './entryAnalysisService';

function makeEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 7,
    date: '2026-04-01',
    text: 'Long enough diary text content for analysis',
    mood: 3,
    tags: [],
    isPrivate: false,
    aiAllowed: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function setupAIEnabled() {
  mockLoadAISettings.mockReturnValue({
    enabled: true,
    provider: 'lovable',
    strictPrivacy: false,
  });
}

function resetAllMocks() {
  mockEntriesGet.mockReset();
  mockUpdateEntry.mockReset();
  mockUpdateEntry.mockResolvedValue(undefined);
  mockSupabaseInvoke.mockReset();
  mockLoadAISettings.mockReset();
  mockQueueWhere.mockReset();
  mockQueueAdd.mockReset();
  mockQueueAdd.mockResolvedValue(1);
  mockQueueUpdate.mockReset();
  mockQueueUpdate.mockResolvedValue(undefined);
  mockQueueDelete.mockReset();
  mockQueueDelete.mockResolvedValue(undefined);
}

describe('analyzeEntryInBackground - mood provenance', () => {
  beforeEach(() => {
    resetAllMocks();
    setupAIEnabled();
  });

  it('writes moodSource=ai and applies AI mood when userSetMood=false', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 3, title: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 5, confidence: 0.9, semanticTags: ['joy'], requestId: 'r1' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.mood).toBe(5);
    expect(updates.moodSource).toBe('ai');
    expect(updates.aiAnalyzedAt).toBeTypeOf('number');
  });

  it('writes moodSource=user and does NOT overwrite mood when userSetMood=true', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 4, title: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 1, confidence: 0.9, semanticTags: [], requestId: 'r1' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], true, 'en');

    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.moodSource).toBe('user');
    expect(updates.mood).toBeUndefined();
  });

  it('clobbers a prior moodSource=user when caller passes userSetMood=false', async () => {
    // This protects the contract: the caller is the source of truth for the
    // userSetMood signal. If NewEntry.tsx ever miscomputes the signal as false
    // for a user-authored mood, the persisted moodSource WILL flip to 'ai'.
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 4, moodSource: 'user', title: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 2, confidence: 0.9, semanticTags: [], requestId: 'r1' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.moodSource).toBe('ai');
    expect(updates.mood).toBe(2);
  });
});

describe('analyzeEntryInBackground - title provenance', () => {
  beforeEach(() => {
    resetAllMocks();
    setupAIEnabled();
  });

  it('applies AI title and titleSource=ai when no current title exists', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ title: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 4, confidence: 0.8, semanticTags: [], titleSuggestion: 'Sigil of Sunday', requestId: 'r2' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.title).toBe('Sigil of Sunday');
    expect(updates.titleSource).toBe('ai');
  });

  it('does not overwrite an existing AI title even if AI returns a new suggestion', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ title: 'Prior AI Title', titleSource: 'ai' }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 4, confidence: 0.8, semanticTags: [], titleSuggestion: 'Replacement', requestId: 'r3' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.title).toBeUndefined();
    expect(updates.titleSource).toBeUndefined();
  });

  it('does not overwrite an existing user title', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ title: 'My Title', titleSource: 'user' }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 4, confidence: 0.8, semanticTags: [], titleSuggestion: 'AI Replacement', requestId: 'r3b' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.title).toBeUndefined();
    expect(updates.titleSource).toBeUndefined();
  });

  it('omits title fields entirely when AI returns no titleSuggestion', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ title: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 4, confidence: 0.8, semanticTags: [], requestId: 'r4' },
      error: null,
    });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.title).toBeUndefined();
    expect(updates.titleSource).toBeUndefined();
  });
});

describe('analyzeEntryInBackground - failure and skip paths', () => {
  beforeEach(() => {
    resetAllMocks();
    setupAIEnabled();
  });

  it('queues entry on edge function failure and preserves the original userSetMood signal', async () => {
    const queueFirst = vi.fn().mockResolvedValue(undefined);
    mockQueueWhere.mockReturnValue({ equals: vi.fn(() => ({ first: queueFirst })) });
    mockSupabaseInvoke.mockResolvedValue({ data: null, error: { message: 'fail' } });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    expect(mockUpdateEntry).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const queued = mockQueueAdd.mock.calls[0][0] as AnalysisQueueItem;
    expect(queued.entryId).toBe(7);
    expect(queued.userSetMood).toBe(false);
    expect(queued.language).toBe('en');
  });

  it('does nothing when text is below the minimum length', async () => {
    await analyzeEntryInBackground(7, 'short', [], false, 'en');

    expect(mockSupabaseInvoke).not.toHaveBeenCalled();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('does nothing when AI is disabled in settings', async () => {
    mockLoadAISettings.mockReturnValue({ enabled: false, provider: 'lovable', strictPrivacy: false });

    await analyzeEntryInBackground(7, 'Long enough diary text content for analysis', [], false, 'en');

    expect(mockSupabaseInvoke).not.toHaveBeenCalled();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });
});

describe('processAnalysisQueue - mood provenance', () => {
  beforeEach(() => {
    resetAllMocks();
    setupAIEnabled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  function setupQueueWithItem(item: AnalysisQueueItem) {
    // db.analysisQueue.where('status').equals('pending').sortBy('createdAt')
    const sortBy = vi.fn().mockResolvedValue([item]);
    const equals = vi.fn(() => ({ sortBy }));
    mockQueueWhere.mockReturnValue({ equals });
  }

  it('queue path: applies AI mood and moodSource=ai when item.userSetMood=false', async () => {
    setupQueueWithItem({
      id: 1,
      entryId: 7,
      userSetMood: false,
      language: 'en',
      createdAt: 100,
      attempts: 0,
      status: 'pending',
    });
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 3, title: undefined, aiAnalyzedAt: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 5, confidence: 0.9, semanticTags: ['joy'], requestId: 'r' },
      error: null,
    });

    await processAnalysisQueue();

    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.mood).toBe(5);
    expect(updates.moodSource).toBe('ai');
  });

  it('queue path: when item.userSetMood=true it preserves explicit user provenance', async () => {
    // Queue retry must match the inline path: if the original save boundary
    // recorded an explicit user mood, the delayed retry may not lose that
    // provenance just because AI analysis happened later.
    setupQueueWithItem({
      id: 1,
      entryId: 7,
      userSetMood: true,
      language: 'en',
      createdAt: 100,
      attempts: 0,
      status: 'pending',
    });
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 4, title: undefined, aiAnalyzedAt: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 1, confidence: 0.9, semanticTags: [], requestId: 'r' },
      error: null,
    });

    await processAnalysisQueue();

    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.mood).toBeUndefined();
    expect(updates.moodSource).toBe('user');
  });

  it('queue path: skips entries that were already AI-analyzed', async () => {
    setupQueueWithItem({
      id: 1,
      entryId: 7,
      userSetMood: false,
      language: 'en',
      createdAt: 100,
      attempts: 0,
      status: 'pending',
    });
    mockEntriesGet.mockResolvedValue(makeEntry({ aiAnalyzedAt: 999 }));

    await processAnalysisQueue();

    expect(mockSupabaseInvoke).not.toHaveBeenCalled();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
    expect(mockQueueDelete).toHaveBeenCalledWith(1);
  });
});

describe('reanalyzeEntry - mood provenance', () => {
  beforeEach(() => {
    resetAllMocks();
    setupAIEnabled();
  });

  it('treats unsourced non-default mood as not-user so AI may reclassify it', async () => {
    // Unsourced mood is not authored proof. Reanalysis may replace it with an
    // AI-derived mood instead of promoting the existing value to user truth.
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 4, moodSource: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 1, confidence: 0.9, semanticTags: [], requestId: 'r' },
      error: null,
    });

    const ok = await reanalyzeEntry(7, 'en');

    expect(ok).toBe(true);
    expect(mockUpdateEntry).toHaveBeenCalledTimes(1);
    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.moodSource).toBe('ai');
    expect(updates.mood).toBe(1);
  });

  it('treats unsourced default mood (3) as not-user — AI mood is applied', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 3, moodSource: undefined }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 5, confidence: 0.9, semanticTags: [], requestId: 'r' },
      error: null,
    });

    await reanalyzeEntry(7, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.moodSource).toBe('ai');
    expect(updates.mood).toBe(5);
  });

  it('treats prior moodSource=ai as not-user — AI mood is reapplied (not promoted to user)', async () => {
    // Important: an entry that was previously AI-analyzed must not be
    // accidentally promoted to user provenance just by being reanalyzed.
    mockEntriesGet.mockResolvedValue(makeEntry({ mood: 4, moodSource: 'ai' }));
    mockSupabaseInvoke.mockResolvedValue({
      data: { mood: 2, confidence: 0.9, semanticTags: [], requestId: 'r' },
      error: null,
    });

    await reanalyzeEntry(7, 'en');

    const updates = mockUpdateEntry.mock.calls[0][1];
    expect(updates.moodSource).toBe('ai');
    expect(updates.mood).toBe(2);
  });

  it('skips private entries entirely', async () => {
    mockEntriesGet.mockResolvedValue(makeEntry({ isPrivate: true, aiAllowed: false }));

    const ok = await reanalyzeEntry(7, 'en');

    expect(ok).toBe(false);
    expect(mockSupabaseInvoke).not.toHaveBeenCalled();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });
});
