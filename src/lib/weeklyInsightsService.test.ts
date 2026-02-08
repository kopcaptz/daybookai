import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────
vi.mock('./db', () => ({
  db: {
    entries: {
      where: vi.fn(() => ({
        between: vi.fn(() => ({
          toArray: vi.fn(),
        })),
      })),
    },
    table: vi.fn(() => ({
      get: vi.fn(),
      put: vi.fn(),
    })),
  },
}));

vi.mock('./aiTokenService', () => ({
  isAITokenValid: vi.fn(),
  getAIToken: vi.fn(),
}));

vi.mock('./aiConfig', () => ({
  loadAISettings: vi.fn(),
}));

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./i18n', () => ({
  getBaseLanguage: vi.fn((lang: string) => (lang === 'ru' ? 'ru' : 'en')),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Imports (after mocks) ──────────────────────────────────────
import { generateWeeklyInsight } from './weeklyInsightsService';
import { db } from './db';
import { isAITokenValid, getAIToken } from './aiTokenService';
import { loadAISettings } from './aiConfig';

// ── Helpers ────────────────────────────────────────────────────
function makeEntry(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    date: '2026-02-05',
    text: 'Some diary text here that is long enough blah blah',
    mood: 3,
    tags: ['daily'],
    isPrivate: false,
    aiAllowed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    semanticTags: ['work'],
    title: 'Test entry',
    ...overrides,
  };
}

/**
 * Wire the Dexie chain mock so
 *   db.entries.where('date').between(...).toArray()
 * resolves with the supplied entries.
 */
function mockDbEntries(entries: any[]) {
  const mockToArray = vi.fn().mockResolvedValue(entries);
  const mockBetween = vi.fn().mockReturnValue({ toArray: mockToArray });
  (db.entries.where as any).mockReturnValue({ between: mockBetween });
}

// ── Suite ──────────────────────────────────────────────────────
describe('weeklyInsightsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ──────────────────────────────────────────────────────────────
  // 1. Returns error when token is invalid
  // ──────────────────────────────────────────────────────────────
  it('generateWeeklyInsight returns error when token is invalid', async () => {
    (isAITokenValid as any).mockReturnValue(false);

    const result = await generateWeeklyInsight('ru' as any);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('token_invalid');
    }
  });

  // ──────────────────────────────────────────────────────────────
  // 2. Sends text preview when strictPrivacy is OFF
  // ──────────────────────────────────────────────────────────────
  it('generateWeeklyInsight sends text preview when strictPrivacy is OFF', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (getAIToken as any).mockReturnValue({ token: 'tok', expiresAt: Date.now() + 100000 });
    (loadAISettings as any).mockReturnValue({ strictPrivacy: false });

    const entries = [
      makeEntry({ id: 1, date: '2026-02-03' }),
      makeEntry({ id: 2, date: '2026-02-04' }),
      makeEntry({ id: 3, date: '2026-02-05' }),
    ];
    mockDbEntries(entries);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'ok',
        dominantThemes: ['work'],
        moodPattern: 'stable',
        insight: 'insight',
        suggestion: 'suggestion',
      }),
    });

    const result = await generateWeeklyInsight('en' as any);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Parse the body sent to fetch
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    // text should be present (string)
    expect(typeof fetchBody.entries[0].text).toBe('string');
    expect(fetchBody.entries[0].text.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────
  // 3. Omits text when strictPrivacy is ON
  // ──────────────────────────────────────────────────────────────
  it('generateWeeklyInsight omits text when strictPrivacy is ON', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (getAIToken as any).mockReturnValue({ token: 'tok', expiresAt: Date.now() + 100000 });
    (loadAISettings as any).mockReturnValue({ strictPrivacy: true });

    const entries = [
      makeEntry({ id: 1, date: '2026-02-03' }),
      makeEntry({ id: 2, date: '2026-02-04' }),
      makeEntry({ id: 3, date: '2026-02-05' }),
    ];
    mockDbEntries(entries);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'ok',
        dominantThemes: ['work'],
        moodPattern: 'stable',
        insight: 'insight',
        suggestion: 'suggestion',
      }),
    });

    const result = await generateWeeklyInsight('en' as any);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    // text should be absent (undefined)
    expect(fetchBody.entries[0].text).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────
  // 4. Filters private entries → not_enough_entries if < 3 remain
  // ──────────────────────────────────────────────────────────────
  it('generateWeeklyInsight filters private entries', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (getAIToken as any).mockReturnValue({ token: 'tok', expiresAt: Date.now() + 100000 });
    (loadAISettings as any).mockReturnValue({ strictPrivacy: false });

    const entries = [
      makeEntry({ id: 1, isPrivate: false }),
      makeEntry({ id: 2, isPrivate: false }),
      makeEntry({ id: 3, isPrivate: true }),          // filtered out
      makeEntry({ id: 4, isPrivate: false, aiAllowed: false }), // filtered out
    ];
    mockDbEntries(entries);

    const result = await generateWeeklyInsight('ru' as any);

    // After filtering: 2 entries remain → < 3 → not enough
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('not_enough_entries');
    }
    // API should NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
