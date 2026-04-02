import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { BackupRestoreCard } from './BackupRestoreCard';

const mocks = vi.hoisted(() => ({
  exportBackupZip: vi.fn(),
  evaluateRestoreProvenance: vi.fn(),
  importBackupZip: vi.fn(),
  importFullBackup: vi.fn(),
  readBackupFile: vi.fn(),
  getLastBackupDate: vi.fn(),
  getImportSummary: vi.fn(),
  getImportSummaryFromManifest: vi.fn(),
  estimateBackupSize: vi.fn(),
  downloadBackupZip: vi.fn(),
  shouldShowBackupReminder: vi.fn(),
  dismissBackupReminder: vi.fn(),
  getDaysSinceLastBackup: vi.fn(),
  getSyncOwnerUserId: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/backupService', () => ({
  exportBackupZip: mocks.exportBackupZip,
  evaluateRestoreProvenance: mocks.evaluateRestoreProvenance,
  importBackupZip: mocks.importBackupZip,
  importFullBackup: mocks.importFullBackup,
  readBackupFile: mocks.readBackupFile,
  getLastBackupDate: mocks.getLastBackupDate,
  getImportSummary: mocks.getImportSummary,
  getImportSummaryFromManifest: mocks.getImportSummaryFromManifest,
  estimateBackupSize: mocks.estimateBackupSize,
  downloadBackupZip: mocks.downloadBackupZip,
  shouldShowBackupReminder: mocks.shouldShowBackupReminder,
  dismissBackupReminder: mocks.dismissBackupReminder,
  getDaysSinceLastBackup: mocks.getDaysSinceLastBackup,
}));

vi.mock('@/lib/syncService', () => ({
  getSyncOwnerUserId: mocks.getSyncOwnerUserId,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ language: 'en' }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => 'never',
}));

vi.mock('date-fns/locale', () => ({
  ru: {},
  enUS: {},
  he: {},
  ar: {},
}));

vi.mock('@/lib/mediaUtils', () => ({
  formatFileSize: (size: number) => `${size} B`,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/progress', () => ({
  Progress: (props: any) => <div {...props} />,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: any) => <div>{children}</div>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe('BackupRestoreCard restore confirmation truth', () => {
  beforeEach(() => {
    mocks.exportBackupZip.mockReset();
    mocks.evaluateRestoreProvenance.mockReset();
    mocks.importBackupZip.mockReset();
    mocks.importFullBackup.mockReset();
    mocks.readBackupFile.mockReset();
    mocks.getLastBackupDate.mockReset();
    mocks.getImportSummary.mockReset();
    mocks.getImportSummaryFromManifest.mockReset();
    mocks.estimateBackupSize.mockReset();
    mocks.downloadBackupZip.mockReset();
    mocks.shouldShowBackupReminder.mockReset();
    mocks.dismissBackupReminder.mockReset();
    mocks.getDaysSinceLastBackup.mockReset();
    mocks.getSyncOwnerUserId.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.getLastBackupDate.mockReturnValue(null);
    mocks.estimateBackupSize.mockResolvedValue(0);
    mocks.getSyncOwnerUserId.mockReturnValue('owner-123');
    mocks.readBackupFile.mockResolvedValue({
      type: 'json',
      data: {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01T00:00:00.000Z',
          appVersion: '1.0.0',
          ownerUserId: 'owner-456',
          tables: {},
        },
        entries: [],
        attachments: [],
        drafts: [],
      },
    });
    mocks.evaluateRestoreProvenance.mockReturnValue({ allowed: false, reason: 'owner_mismatch' });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows rejection and does not proceed to confirmation or import for denied backups', async () => {
    const { container } = render(<BackupRestoreCard />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'This backup belongs to a different cloud owner and cannot be restored on this device.'
      );
    });

    expect(mocks.getImportSummary).not.toHaveBeenCalled();
    expect(mocks.getImportSummaryFromManifest).not.toHaveBeenCalled();
    expect(mocks.importFullBackup).not.toHaveBeenCalled();
    expect(mocks.importBackupZip).not.toHaveBeenCalled();
  });

  it('shows grouped restore categories beyond the old four-item list', async () => {
    mocks.readBackupFile.mockResolvedValueOnce({
      type: 'json',
      data: {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01T00:00:00.000Z',
          appVersion: '1.0.0',
          ownerUserId: 'owner-123',
          tables: {},
        },
        entries: [],
        attachments: [],
        drafts: [],
      },
    });
    mocks.evaluateRestoreProvenance.mockReturnValueOnce({ allowed: true });
    mocks.getImportSummary.mockReturnValueOnce({
      entries: 2,
      attachments: 1,
      drafts: 1,
      biographies: 1,
      reminders: 0,
      receipts: 0,
      receiptItems: 0,
      discussionSessions: 1,
      discussionMessages: 3,
      weeklyInsights: 1,
      audioTranscripts: 1,
      attachmentInsights: 1,
      analysisQueue: 1,
      scanLogs: 0,
    });

    const { container, getByText, queryByText } = render(<BackupRestoreCard />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(getByText('Will restore:')).toBeTruthy();
    });

    expect(container.textContent).toContain('4 — Journal content');
    expect(container.textContent).toContain('4 — Discussions');
    expect(container.textContent).toContain('5 — Chronicles and analysis artifacts');
    expect(queryByText(/Diagnostics/)).toBeNull();
  });

  it('hides zero-count grouped categories to avoid bloating the dialog', async () => {
    mocks.readBackupFile.mockResolvedValueOnce({
      type: 'json',
      data: {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01T00:00:00.000Z',
          appVersion: '1.0.0',
          ownerUserId: 'owner-123',
          tables: {},
        },
        entries: [],
        attachments: [],
        drafts: [],
      },
    });
    mocks.evaluateRestoreProvenance.mockReturnValueOnce({ allowed: true });
    mocks.getImportSummary.mockReturnValueOnce({
      entries: 1,
      attachments: 0,
      drafts: 0,
      biographies: 0,
      reminders: 0,
      receipts: 0,
      receiptItems: 0,
      discussionSessions: 0,
      discussionMessages: 0,
      weeklyInsights: 0,
      audioTranscripts: 0,
      attachmentInsights: 0,
      analysisQueue: 0,
      scanLogs: 0,
    });

    const { container, queryByText } = render(<BackupRestoreCard />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('1 — Journal content');
    });

    expect(queryByText(/Discussions/)).toBeNull();
    expect(queryByText(/Chronicles and analysis artifacts/)).toBeNull();
    expect(queryByText(/Reminders and record data/)).toBeNull();
    expect(queryByText(/Diagnostics/)).toBeNull();
  });
});
