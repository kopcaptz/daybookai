import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DiscussionsListPage from './DiscussionsListPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  sessions: [] as Array<{ id: number }>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.sessions,
}));

vi.mock('@/lib/db', () => ({
  getAllDiscussionSessions: vi.fn(),
  toggleDiscussionSessionPin: vi.fn(),
  deleteDiscussionSession: vi.fn(),
}));

vi.mock('@/components/discussions/SessionCard', () => ({
  SessionCard: () => null,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/icons/SigilIcon', () => ({
  SealGlyph: () => null,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogCancel: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('DiscussionsListPage birth contract', () => {
  beforeEach(() => {
    mocks.sessions = [];
    mocks.navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('routes the new discussion action into Today selection instead of minting an empty session', () => {
    render(<DiscussionsListPage />);

    fireEvent.click(screen.getByRole('button', { name: 'discussions.new' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/?selectMode=true');
  });
});
