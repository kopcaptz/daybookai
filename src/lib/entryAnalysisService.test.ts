import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/lib/aiTokenService', () => ({
  isAITokenValid: vi.fn(),
}));

vi.mock('@/lib/aiConfig', () => ({
  loadAISettings: vi.fn(),
}));

vi.mock('@/lib/aiUtils', () => ({
  getAITokenHeader: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    entries: {
      get: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(),
          sortBy: vi.fn(() => []),
        })),
      })),
    },
    analysisQueue: {
      add: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn(() => 0),
          toArray: vi.fn(() => []),
          first: vi.fn(),
        })),
      })),
    },
    table: vi.fn(),
  },
  updateEntry: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────
import { analyzeEntryInBackground } from './entryAnalysisService';
import { supabase } from '@/integrations/supabase/client';
import { isAITokenValid } from '@/lib/aiTokenService';
import { loadAISettings } from '@/lib/aiConfig';
import { getAITokenHeader } from '@/lib/aiUtils';
import { db, updateEntry } from '@/lib/db';

// ── Suite ──────────────────────────────────────────────────────
describe('entryAnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ──────────────────────────────────────────────────────────────
  // 1. Skips when AI token is invalid
  // ──────────────────────────────────────────────────────────────
  it('analyzeEntryInBackground skips when AI token is invalid', async () => {
    (isAITokenValid as any).mockReturnValue(false);
    (loadAISettings as any).mockReturnValue({ enabled: true });

    await analyzeEntryInBackground(
      1,
      'This is a long enough diary entry text for analysis',
      ['daily'],
      false,
      'en',
    );

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // 2. Skips when AI is disabled
  // ──────────────────────────────────────────────────────────────
  it('analyzeEntryInBackground skips when AI is disabled', async () => {
    (loadAISettings as any).mockReturnValue({ enabled: false });
    (isAITokenValid as any).mockReturnValue(true);

    await analyzeEntryInBackground(
      1,
      'This is a long enough diary entry text for analysis',
      ['daily'],
      false,
      'en',
    );

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // 3. Sends X-AI-Token header
  // ──────────────────────────────────────────────────────────────
  it('analyzeEntryInBackground sends X-AI-Token header', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (loadAISettings as any).mockReturnValue({ enabled: true, strictPrivacy: false });
    (getAITokenHeader as any).mockReturnValue({ 'X-AI-Token': 'test-token-123' });
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { mood: 4, confidence: 0.8, semanticTags: ['work'], requestId: 'r1' },
      error: null,
    });
    (db.entries.get as any).mockResolvedValue({ title: null });
    (updateEntry as any).mockResolvedValue(undefined);

    await analyzeEntryInBackground(
      1,
      'Today was a really great productive day at the office',
      ['daily'],
      false,
      'en',
    );

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'ai-entry-analyze',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-AI-Token': 'test-token-123' }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────
  // 4. extractGeneralizedThemes returns themes for Russian text
  //    (tested via analyzeEntryInBackground with strictPrivacy)
  // ──────────────────────────────────────────────────────────────
  it('extractGeneralizedThemes returns themes for Russian text', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (loadAISettings as any).mockReturnValue({ enabled: true, strictPrivacy: true });
    (getAITokenHeader as any).mockReturnValue({});
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { mood: 2, confidence: 0.7, semanticTags: ['stress'], requestId: 'r2' },
      error: null,
    });
    (db.entries.get as any).mockResolvedValue({ title: null });
    (updateEntry as any).mockResolvedValue(undefined);

    const ruText = 'Сегодня на работе было очень стрессово, встреча с коллегами затянулась';

    await analyzeEntryInBackground(1, ruText, ['daily'], false, 'ru');

    expect(supabase.functions.invoke).toHaveBeenCalled();

    const callArgs = (supabase.functions.invoke as any).mock.calls[0];
    const bodyText: string = callArgs[1].body.text;

    // Must contain the generalized prefix and detected theme stem
    expect(bodyText).toContain('Запись дневника');
    expect(bodyText).toContain('работ'); // part of theme "работа"
    // Must NOT contain the original verbatim text
    expect(bodyText).not.toBe(ruText);
    expect(bodyText).not.toContain('стрессово, встреча с коллегами затянулась');
  });

  // ──────────────────────────────────────────────────────────────
  // 5. extractGeneralizedThemes returns themes for English text
  // ──────────────────────────────────────────────────────────────
  it('extractGeneralizedThemes returns themes for English text', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (loadAISettings as any).mockReturnValue({ enabled: true, strictPrivacy: true });
    (getAITokenHeader as any).mockReturnValue({});
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { mood: 5, confidence: 0.9, semanticTags: ['family'], requestId: 'r3' },
      error: null,
    });
    (db.entries.get as any).mockResolvedValue({ title: null });
    (updateEntry as any).mockResolvedValue(undefined);

    const enText = 'Had a wonderful dinner with family and friends at the restaurant downtown';

    await analyzeEntryInBackground(1, enText, ['social'], false, 'en');

    expect(supabase.functions.invoke).toHaveBeenCalled();

    const callArgs = (supabase.functions.invoke as any).mock.calls[0];
    const bodyText: string = callArgs[1].body.text;

    // Must contain generalized prefix
    expect(bodyText).toContain('Diary entry');
    // Must contain at least one of the detected themes
    const hasTheme =
      bodyText.includes('family') ||
      bodyText.includes('social') ||
      bodyText.includes('food');
    expect(hasTheme).toBe(true);
    // Must NOT contain the original verbatim text
    expect(bodyText).not.toContain('wonderful dinner');
  });

  // ──────────────────────────────────────────────────────────────
  // 6. Skips short text (< 10 chars)
  // ──────────────────────────────────────────────────────────────
  it('analyzeEntryInBackground skips short text', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (loadAISettings as any).mockReturnValue({ enabled: true });

    await analyzeEntryInBackground(1, 'Hi', ['daily'], false, 'en');

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
