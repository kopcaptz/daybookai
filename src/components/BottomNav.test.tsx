import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BottomNav } from './BottomNav';

const mocks = vi.hoisted(() => ({
  pathname: '/discussions',
  pendingCount: 0,
  startTransition: vi.fn(),
  routeSurface: {
    centerActionPolicy: 'select-entries-for-discussion',
  },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.pendingCount,
}));

vi.mock('@/lib/db', () => ({
  getPendingReminderCount: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/routeSurfaceRegistry', () => ({
  resolveRouteSurface: () => mocks.routeSurface,
}));

vi.mock('@/hooks/useHeroTransition', () => ({
  useHeroTransition: () => ({
    startTransition: mocks.startTransition,
  }),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

describe('BottomNav discussions center action', () => {
  beforeEach(() => {
    mocks.pathname = '/discussions';
    mocks.pendingCount = 0;
    mocks.routeSurface = {
      centerActionPolicy: 'select-entries-for-discussion',
    };
    mocks.startTransition.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('routes the center action into Today selection on the Discussions surface', () => {
    render(<BottomNav />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.startTransition).toHaveBeenCalledWith(expect.any(HTMLElement), '/?selectMode=true');
  });

  it('keeps the default center action on non-discussion surfaces', () => {
    mocks.pathname = '/search';
    mocks.routeSurface = {
      centerActionPolicy: 'new-entry-default',
    };

    render(<BottomNav />);

    fireEvent.click(screen.getByRole('button'));

    expect(mocks.startTransition).toHaveBeenCalledWith(expect.any(HTMLElement), '/new');
  });
});
