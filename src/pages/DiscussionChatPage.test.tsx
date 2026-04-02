import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DiscussionChatPage from './DiscussionChatPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: undefined as any,
  messages: undefined as any,
  useLiveQueryCall: 0,
  getDiscussionSessionById: vi.fn(),
  getMessagesBySessionId: vi.fn(),
  addDiscussionMessage: vi.fn(),
  updateDiscussionSession: vi.fn(),
  deleteDiscussionSession: vi.fn(),
  buildContextPack: vi.fn(),
  sendDiscussionMessage: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '42' }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => {
    mocks.useLiveQueryCall += 1;
    return mocks.useLiveQueryCall % 2 === 1 ? mocks.session : mocks.messages;
  },
}));

vi.mock('@/lib/db', () => ({
  getDiscussionSessionById: mocks.getDiscussionSessionById,
  getMessagesBySessionId: mocks.getMessagesBySessionId,
  addDiscussionMessage: mocks.addDiscussionMessage,
  updateDiscussionSession: mocks.updateDiscussionSession,
  deleteDiscussionSession: mocks.deleteDiscussionSession,
  hasLiveDiscussionAuthority: (scope: { entryIds: number[] }) => scope.entryIds.length > 0,
}));

vi.mock('@/lib/librarian/contextPack', () => ({
  buildContextPack: mocks.buildContextPack,
}));

vi.mock('@/lib/ai/discussions', () => ({
  sendDiscussionMessage: mocks.sendDiscussionMessage,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/discussions/ModeSelector', () => ({
  ModeSelector: () => <div>mode-selector</div>,
  ModePill: ({ mode }: { mode: string }) => <div>{mode}</div>,
}));

vi.mock('@/components/discussions/EvidenceCard', () => ({
  EvidenceList: () => null,
}));

vi.mock('@/components/discussions/ContextDrawer', () => ({
  ContextDrawer: () => null,
}));

vi.mock('@/components/discussions/DraftArtifact', () => ({
  DraftArtifact: () => null,
}));

vi.mock('@/components/discussions/PlanArtifact', () => ({
  PlanArtifact: () => null,
}));

vi.mock('@/components/discussions/AnalysisArtifact', () => ({
  AnalysisArtifact: () => null,
}));

vi.mock('@/components/discussions/ComputeArtifact', () => ({
  ComputeArtifact: () => null,
}));

vi.mock('@/components/discussions/FollowUpQuestions', () => ({
  FollowUpQuestions: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: forwardRef<HTMLTextAreaElement, any>(({ children, ...props }, ref) => (
    <textarea ref={ref} {...props}>
      {children}
    </textarea>
  )),
}));

vi.mock('@/components/ui/toggle', () => ({
  Toggle: ({ children, pressed, onPressedChange: _onPressedChange, ...props }: any) => (
    <button aria-pressed={pressed ? 'true' : 'false'} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
  isRTL: () => false,
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    error: mocks.toastError,
  },
}));

describe('DiscussionChatPage live authority gating', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.useLiveQueryCall = 0;
    mocks.navigate.mockReset();
    mocks.getDiscussionSessionById.mockReset();
    mocks.getMessagesBySessionId.mockReset();
    mocks.addDiscussionMessage.mockReset();
    mocks.updateDiscussionSession.mockReset();
    mocks.deleteDiscussionSession.mockReset();
    mocks.buildContextPack.mockReset();
    mocks.sendDiscussionMessage.mockReset();
    mocks.toastInfo.mockReset();
    mocks.toastError.mockReset();

    mocks.session = {
      id: 42,
      title: 'Docs-only discussion',
      createdAt: 1,
      updatedAt: 1,
      lastMessageAt: 1,
      scope: {
        entryIds: [],
        docIds: [9],
      },
      modeDefault: 'discuss',
    };
    mocks.messages = [];
    mocks.getDiscussionSessionById.mockResolvedValue(mocks.session);
    mocks.getMessagesBySessionId.mockResolvedValue([]);
    mocks.addDiscussionMessage.mockResolvedValue(1);
    mocks.updateDiscussionSession.mockResolvedValue(undefined);
    mocks.deleteDiscussionSession.mockResolvedValue(undefined);
    mocks.buildContextPack.mockResolvedValue({
      contextText: '',
      evidence: [],
    });
    mocks.sendDiscussionMessage.mockResolvedValue({
      answer: 'Mock response',
      usedEvidenceIds: [],
      questions: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows zero-authority sessions as staging and guides the user to add entries first', async () => {
    render(<DiscussionChatPage />);

    expect(await screen.findByText('Add entries to begin this discussion')).toBeTruthy();
    expect(
      screen.getByText('This session is still staging only. Add entries via the Context button so the discussion has live entry-backed authority.')
    ).toBeTruthy();
    expect(screen.getByText('Staging: add entries first')).toBeTruthy();
    expect(screen.queryByText('Find in notes mode active')).toBeNull();

    const input = screen.getByPlaceholderText('Add entries via Context to begin this discussion');
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('does not allow zero-authority sessions to send or persist turns', async () => {
    render(<DiscussionChatPage />);

    const input = await screen.findByPlaceholderText('Add entries via Context to begin this discussion');
    const buttons = screen.getAllByRole('button');
    const sendButton = buttons[buttons.length - 1];

    fireEvent.change(input, { target: { value: 'Can you continue?' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.addDiscussionMessage).not.toHaveBeenCalled();
    });

    expect(mocks.buildContextPack).not.toHaveBeenCalled();
    expect(mocks.sendDiscussionMessage).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledWith('Add entries to the context first to begin this discussion.');
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not force staging onboarding when entry-backed live authority exists', async () => {
    mocks.session = {
      ...mocks.session,
      title: 'Entry-backed discussion',
      scope: {
        entryIds: [7],
        docIds: [9],
      },
    };

    render(<DiscussionChatPage />);

    expect(await screen.findByText('discussion.placeholder')).toBeTruthy();
    expect(screen.queryByText('Add entries to begin this discussion')).toBeNull();
    expect(screen.queryByText('Staging: add entries first')).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'discussion.findInNotes' }).getAttribute('aria-pressed')
      ).toBe('false');
    });
  });

  it('does not delete an empty entry-backed discussion during route handoff', async () => {
    mocks.session = {
      ...mocks.session,
      title: 'Entry-backed discussion',
      scope: {
        entryIds: [7],
        docIds: [],
      },
    };

    const { unmount } = render(<DiscussionChatPage />);

    await screen.findByText('discussion.placeholder');
    unmount();

    await waitFor(() => {
      expect(mocks.getMessagesBySessionId).toHaveBeenCalledWith(42);
    });

    await waitFor(() => {
      expect(mocks.deleteDiscussionSession).not.toHaveBeenCalled();
    });
  });

  it('persists visible grounding entry refs alongside selected biography evidence', async () => {
    mocks.session = {
      ...mocks.session,
      title: 'Entry-backed discussion',
      scope: {
        entryIds: [1, 2],
        docIds: [],
      },
    };
    mocks.getDiscussionSessionById.mockResolvedValue(mocks.session);
    mocks.buildContextPack.mockResolvedValue({
      contextText: 'context',
      evidence: [
        {
          type: 'entry',
          id: 'E1',
          title: 'Entry 1',
          deepLink: '/entry/1',
          entityId: 1,
        },
        {
          type: 'entry',
          id: 'E2',
          title: 'Entry 2',
          deepLink: '/entry/2',
          entityId: 2,
        },
        {
          type: 'biography',
          id: 'B1',
          title: 'Chronicle',
          deepLink: '/day/2026-04-01',
          entityId: 0,
          biographyDate: '2026-04-01',
          supportedByEvidenceIds: ['E1', 'E2'],
          knownSourceEntryCount: 2,
        },
      ],
    });
    mocks.sendDiscussionMessage.mockResolvedValue({
      answer: 'Answer [B1]',
      usedEvidenceIds: ['B1'],
      questions: [],
    });

    render(<DiscussionChatPage />);

    const input = await screen.findByPlaceholderText('What do you think about...');
    fireEvent.change(input, { target: { value: 'Summarize this day' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mocks.addDiscussionMessage).toHaveBeenCalledTimes(2);
    });

    expect(mocks.addDiscussionMessage.mock.calls[1][0].evidenceRefs).toEqual([
      expect.objectContaining({ id: 'E1', type: 'entry' }),
      expect.objectContaining({ id: 'E2', type: 'entry' }),
      expect.objectContaining({
        id: 'B1',
        type: 'biography',
        supportedByEvidenceIds: ['E1', 'E2'],
      }),
    ]);
    expect(mocks.buildContextPack).toHaveBeenCalledTimes(1);
    expect(mocks.sendDiscussionMessage).toHaveBeenCalledTimes(1);
  });
});
