import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DiscussionChatPage from './DiscussionChatPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  session: undefined as any,
  messages: undefined as any,
  useLiveQueryCall: 0,
  getMessagesBySessionId: vi.fn(),
  deleteDiscussionSession: vi.fn(),
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
  getDiscussionSessionById: vi.fn(),
  getMessagesBySessionId: mocks.getMessagesBySessionId,
  addDiscussionMessage: vi.fn(),
  updateDiscussionSession: vi.fn(),
  deleteDiscussionSession: mocks.deleteDiscussionSession,
  hasLiveDiscussionAuthority: (scope: { entryIds: number[] }) => scope.entryIds.length > 0,
}));

vi.mock('@/lib/librarian/contextPack', () => ({
  buildContextPack: vi.fn(),
}));

vi.mock('@/lib/ai/discussions', () => ({
  sendDiscussionMessage: vi.fn(),
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
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DiscussionChatPage live authority gating', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.useLiveQueryCall = 0;
    mocks.navigate.mockReset();
    mocks.getMessagesBySessionId.mockReset();
    mocks.deleteDiscussionSession.mockReset();

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
    mocks.getMessagesBySessionId.mockResolvedValue([]);
    mocks.deleteDiscussionSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('treats docs-only scope as lacking live authority', async () => {
    render(<DiscussionChatPage />);

    expect(await screen.findByText('Find in notes mode active')).toBeTruthy();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'discussion.findInNotes' }).getAttribute('aria-pressed')
      ).toBe('true');
    });
  });
});
