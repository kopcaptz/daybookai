import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './SettingsPage';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  resetAppState: vi.fn(),
  clearAllData: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
  setTheme: vi.fn(),
  setLanguage: vi.fn(),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'system', setTheme: mocks.setTheme }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
}));

vi.mock('@/lib/db', () => ({
  clearAllData: mocks.clearAllData,
  STORAGE_WARNINGS: { warning: 1000, critical: 2000 },
  loadBioSettings: () => ({ bioTime: '10:00' }),
  saveBioSettings: vi.fn(),
}));

vi.mock('@/lib/resetService', () => ({
  resetAppState: mocks.resetAppState,
}));

vi.mock('@/hooks/useStorageUsage', () => ({
  useStorageUsage: () => ({ total: 100, formatted: '100 B', warning: null }),
}));

vi.mock('@/lib/mediaUtils', () => ({ formatFileSize: (n: number) => `${n}` }));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, language: 'en', setLanguage: mocks.setLanguage }),
}));

vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock('@/components/ui/switch', () => ({ Switch: (props: any) => <button {...props} /> }));
vi.mock('@/components/InstallPrompt', () => ({ InstallButton: () => <div>install</div> }));
vi.mock('@/components/AISettingsCard', () => ({ AISettingsCard: () => <div>ai-settings</div> }));
vi.mock('@/components/settings/BackupRestoreCard', () => ({
  BackupRestoreCard: () => <div>backup-restore</div>,
  BackupReminderBanner: () => <div>backup-banner</div>,
}));
vi.mock('@/components/SyncSettingsCard', () => ({ SyncSettingsCard: () => <div>sync-settings</div> }));
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/icons/SigilIcon', () => ({ GrimoireIcon: () => <div /> }));
vi.mock('@/components/icons/RabbitHoleIcon', () => ({ RabbitHoleIcon: () => <div /> }));
vi.mock('@/lib/notifications', () => ({
  isCapacitorNative: () => false,
  requestNotificationPermission: vi.fn(),
  scheduleTestNotification: vi.fn(),
}));
vi.mock('@/lib/reminderNotifications', () => ({
  loadReminderNotificationSettings: () => ({ enabled: false }),
  saveReminderNotificationSettings: vi.fn(),
  reconcileReminderNotifications: vi.fn(),
  cancelAllReminderNotifications: vi.fn(),
}));
vi.mock('@/lib/utils', () => ({ cn: (...v: any[]) => v.filter(Boolean).join(' ') }));
vi.mock('react-router-dom', () => ({ Link: ({ children }: any) => <div>{children}</div>, useNavigate: () => mocks.navigate }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

describe('SettingsPage reset critical failure reporting', () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.resetAppState.mockReset();
    mocks.clearAllData.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.navigate.mockReset();
    vi.stubGlobal('location', { reload: vi.fn() } as any);
  });

  it('surfaces residual categories instead of first-step generic failure', async () => {
    mocks.resetAppState.mockResolvedValue({
      ok: false,
      status: 'critical_failure',
      completedSteps: ['clearAdminToken'],
      criticalFailures: [{ step: 'signOutAuthSession', message: 'Sign out failed' }],
      nonCriticalFailures: [],
      criticalResiduals: ['auth_session', 'sync_owner_state'],
    });

    render(<SettingsPage />);

    fireEvent.click(screen.getByText('Reset device'));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Reset incomplete: this device is not yet considered safe to transfer. Possible remaining residue: account session may still be active; local owner binding or sync metadata may still remain.'
      );
    });
  });
});
