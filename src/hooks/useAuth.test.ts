import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { useAuth } from './useAuth';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSyncOwnerUserId: vi.fn(),
  authListener: null as ((event: string, session: any) => void) | null,
  unsubscribe: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock('@/lib/syncService', () => ({
  getSyncOwnerUserId: mocks.getSyncOwnerUserId,
}));

function makeSession(userId: string) {
  return {
    user: { id: userId },
  } as any;
}

describe('useAuth foreign-owner gating', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.onAuthStateChange.mockReset();
    mocks.signUp.mockReset();
    mocks.signInWithPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.getSyncOwnerUserId.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.authListener = null;

    mocks.onAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      mocks.authListener = callback;
      return {
        data: {
          subscription: {
            unsubscribe: mocks.unsubscribe,
          },
        },
      };
    });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getSyncOwnerUserId.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('rejects a foreign-owner initial session and triggers sign-out', async () => {
    mocks.getSyncOwnerUserId.mockReturnValue('owner-123');
    mocks.getSession.mockResolvedValue({ data: { session: makeSession('user-456') } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('rejects a foreign-owner auth-state-change session and triggers sign-out', async () => {
    mocks.getSyncOwnerUserId.mockReturnValue('owner-123');

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      mocks.authListener?.('SIGNED_IN', makeSession('user-456'));
    });

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  it('accepts a same-owner session', async () => {
    mocks.getSyncOwnerUserId.mockReturnValue('user-123');
    mocks.getSession.mockResolvedValue({ data: { session: makeSession('user-123') } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('user-123');
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('accepts a session on an unowned device', async () => {
    mocks.getSyncOwnerUserId.mockReturnValue(null);
    mocks.getSession.mockResolvedValue({ data: { session: makeSession('user-123') } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('user-123');
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
