import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContextDrawer } from './ContextDrawer';

vi.mock('@/lib/db', () => ({
  db: {
    entries: {
      get: vi.fn(),
    },
  },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ContextDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps docs-only stored shape out of the live context drawer', () => {
    render(
      <ContextDrawer
        open
        onOpenChange={() => {}}
        entryIds={[]}
        onAddFromToday={() => {}}
      />
    );

    expect(screen.getByText('discussion.context')).toBeTruthy();
    expect(screen.queryByText(/documents/i)).toBeNull();
    expect(screen.getByText('Entries (0)')).toBeTruthy();
  });
});
