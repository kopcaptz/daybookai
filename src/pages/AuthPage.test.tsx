import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthPage from './AuthPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  clearAuthRejectionReason: vi.fn(),
  authState: {
    isAuthenticated: false,
    loading: false,
    authRejectionReason: null as null | 'foreign_owner',
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: mocks.authState.isAuthenticated,
    loading: mocks.authState.loading,
    authRejectionReason: mocks.authState.authRejectionReason,
    clearAuthRejectionReason: mocks.clearAuthRejectionReason,
    signIn: mocks.signIn,
    signUp: mocks.signUp,
  }),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    language: 'en',
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

describe('AuthPage foreign-owner rejection surface', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.signIn.mockReset();
    mocks.signUp.mockReset();
    mocks.clearAuthRejectionReason.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.authState.isAuthenticated = false;
    mocks.authState.loading = false;
    mocks.authState.authRejectionReason = null;
    mocks.signIn.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  async function submitLogin() {
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret12' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('owner@example.com', 'secret12');
    });
  }

  it('does not show success from raw sign-in completion alone when auth is later rejected', async () => {
    const view = render(<AuthPage />);

    await submitLogin();

    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    mocks.authState.authRejectionReason = 'foreign_owner';
    view.rerender(<AuthPage />);

    await waitFor(() => {
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
  });

  it('shows an explicit foreign-owner rejection message', async () => {
    const view = render(<AuthPage />);

    await submitLogin();

    mocks.authState.authRejectionReason = 'foreign_owner';
    view.rerender(<AuthPage />);

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This device is already bound to another cloud account. Reset this device before signing in with another account.'
      );
    });
  });

  it('shows normal success after accepted auth state arrives', async () => {
    const view = render(<AuthPage />);

    await submitLogin();

    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    mocks.authState.isAuthenticated = true;
    view.rerender(<AuthPage />);

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Signed in successfully');
    });
  });
});
