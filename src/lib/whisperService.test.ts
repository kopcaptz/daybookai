import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('./logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('./aiTokenService', () => ({
  isAITokenValid: vi.fn(),
  getAIToken: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────
import { fetchWhisper, getFallbackWhisper } from './whisperService';
import { isAITokenValid, getAIToken } from './aiTokenService';

// ── Suite ──────────────────────────────────────────────────────
describe('whisperService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-08T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────────────
  // 1. Returns cached value if exists
  // ──────────────────────────────────────────────────────────────
  it('fetchWhisper returns cached value if exists', async () => {
    localStorage.setItem('whisper-2026-02-08', 'Cached whisper');

    const result = await fetchWhisper('ru');

    expect(result).toBe('Cached whisper');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────
  // 2. Uses fallback when AI token is invalid
  // ──────────────────────────────────────────────────────────────
  it('fetchWhisper uses fallback when AI token is invalid', async () => {
    (isAITokenValid as any).mockReturnValue(false);

    const result = await fetchWhisper('ru');

    // Should return a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Fetch should NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
    // Result should be cached
    expect(localStorage.getItem('whisper-2026-02-08')).toBe(result);
  });

  // ──────────────────────────────────────────────────────────────
  // 3. Sends X-AI-Token header when token is valid
  // ──────────────────────────────────────────────────────────────
  it('fetchWhisper sends X-AI-Token header when token is valid', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (getAIToken as any).mockReturnValue({
      token: 'whisper-token-abc',
      expiresAt: Date.now() + 100000,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ whisper: 'AI generated whisper' }),
    });

    const result = await fetchWhisper('en');

    expect(result).toBe('AI generated whisper');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('ai-whisper');
    expect(options.headers['X-AI-Token']).toBe('whisper-token-abc');
  });

  // ──────────────────────────────────────────────────────────────
  // 4. Falls back on fetch error (does not throw)
  // ──────────────────────────────────────────────────────────────
  it('fetchWhisper falls back on fetch error', async () => {
    (isAITokenValid as any).mockReturnValue(true);
    (getAIToken as any).mockReturnValue({
      token: 'x',
      expiresAt: Date.now() + 100000,
    });

    mockFetch.mockRejectedValue(new Error('Network error'));

    // Should NOT throw
    const result = await fetchWhisper('ru');

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────
  // 5. getFallbackWhisper is deterministic for the same date
  // ──────────────────────────────────────────────────────────────
  it('getFallbackWhisper is deterministic for same date', () => {
    const first = getFallbackWhisper('ru', '2026-02-08');
    const second = getFallbackWhisper('ru', '2026-02-08');

    expect(first).toBe(second);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
  });
});
