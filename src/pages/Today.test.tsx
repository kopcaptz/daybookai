import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Today from './Today';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createDiscussionSession: vi.fn(),
  getDiscussionSessionById: vi.fn(),
  updateDiscussionSession: vi.fn(),
  getBiography: vi.fn(),
  toastError: vi.fn(),
  searchParams: new URLSearchParams(),
  entries: [] as any[],
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.searchParams, vi.fn()],
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.entries,
}));

vi.mock('@/lib/db', () => ({
  getEntriesByDate: vi.fn(),
  createDiscussionSession: mocks.createDiscussionSession,
  getDiscussionSessionById: mocks.getDiscussionSessionById,
  updateDiscussionSession: mocks.updateDiscussionSession,
}));

vi.mock('@/lib/biographyService', () => ({
  getBiography: mocks.getBiography,
}));

vi.mock('@/lib/aiConfig', () => ({
  loadAISettings: () => ({ enabled: false }),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('@/hooks/useBiographyPrompts', () => ({
  useBiographyPrompts: () => ({
    prompt: null,
    isGenerating: false,
    generate: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/hooks/useOracleWhisper', () => ({
  useOracleWhisper: () => ({ whisper: null }),
}));

vi.mock('@/hooks/useHeroTransition', () => ({
  useHeroTransition: () => ({ startTransition: vi.fn() }),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/EntryCard', () => ({
  EntryCard: ({ entry, selectable, onSelect }: any) =>
    selectable ? (
      <button onClick={() => onSelect?.(entry.id)}>{entry.text}</button>
    ) : (
      <div>{entry.text}</div>
    ),
}));

vi.mock('@/components/BiographyDisplay', () => ({
  BiographyDisplay: () => null,
}));

vi.mock('@/components/BiographyPromptDialog', () => ({
  BiographyPromptDialog: () => null,
}));

vi.mock('@/components/reminders/RemindersSection', () => ({
  RemindersSection: () => null,
}));

vi.mock('@/components/reminders/QuickReminderSheet', () => ({
  QuickReminderSheet: () => null,
}));

vi.mock('@/components/WeeklyInsightsWidget', () => ({
  WeeklyInsightsWidget: () => null,
}));

vi.mock('@/components/icons/BreathingSigil', () => ({
  BreathingSigil: () => null,
}));

vi.mock('@/components/icons/SigilIcon', () => ({
  GrimoireIcon: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

describe('Today discussion handoff', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.entries = [
      {
        id: 1,
        date: '2026-04-02',
        text: 'Entry 1',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 3,
        date: '2026-04-02',
        text: 'Entry 3',
        mood: 3,
        tags: [],
        isPrivate: false,
        aiAllowed: true,
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    mocks.navigate.mockReset();
    mocks.createDiscussionSession.mockReset();
    mocks.getDiscussionSessionById.mockReset();
    mocks.updateDiscussionSession.mockReset();
    mocks.getBiography.mockReset();
    mocks.toastError.mockReset();

    mocks.getBiography.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a new discussion when no discussion handoff is present', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true');
    mocks.createDiscussionSession.mockResolvedValue(77);

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.createDiscussionSession).toHaveBeenCalledWith({
        title: 'New discussion',
        scope: { entryIds: [1], docIds: [] },
        modeDefault: 'discuss',
      });
    });

    expect(mocks.getDiscussionSessionById).not.toHaveBeenCalled();
    expect(mocks.updateDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/discussions/77');
  });

  it('extends the handed-off discussion scope without duplicating existing entries', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true&discussionId=42');
    mocks.getDiscussionSessionById.mockResolvedValue({
      id: 42,
      title: 'Existing discussion',
      createdAt: 1,
      updatedAt: 1,
      lastMessageAt: 1,
      scope: {
        entryIds: [2, 1],
        docIds: [9],
      },
      modeDefault: 'discuss',
    });

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entry 3' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.updateDiscussionSession).toHaveBeenCalledWith(42, {
        scope: {
          entryIds: [2, 1, 3],
          docIds: [9],
        },
      });
    });

    expect(mocks.createDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/discussions/42');
  });

  it('keeps the handoff merge idempotent when every selected entry is already scoped', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true&discussionId=42');
    mocks.getDiscussionSessionById.mockResolvedValue({
      id: 42,
      title: 'Existing discussion',
      createdAt: 1,
      updatedAt: 1,
      lastMessageAt: 1,
      scope: {
        entryIds: [1, 3],
        docIds: [9],
      },
      modeDefault: 'discuss',
    });

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entry 3' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.updateDiscussionSession).toHaveBeenCalledWith(42, {
        scope: {
          entryIds: [1, 3],
          docIds: [9],
        },
      });
    });

    expect(mocks.createDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/discussions/42');
  });

  it('does not silently create a new session when the handed-off discussion is missing', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true&discussionId=42');
    mocks.getDiscussionSessionById.mockResolvedValue(undefined);

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Discussion not found');
    });

    expect(mocks.createDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.updateDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('fails closed when the discussion handoff id is malformed', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true&discussionId=not-a-number');

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Discussion not found');
    });

    expect(mocks.getDiscussionSessionById).not.toHaveBeenCalled();
    expect(mocks.createDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.updateDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('fails closed when the discussion handoff id is only partially numeric', async () => {
    mocks.searchParams = new URLSearchParams('selectMode=true&discussionId=42abc');

    render(<Today />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entry 1' }));
    fireEvent.click(screen.getByRole('button', { name: /today\.discuss/i }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Discussion not found');
    });

    expect(mocks.getDiscussionSessionById).not.toHaveBeenCalled();
    expect(mocks.createDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.updateDiscussionSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
