import { clearAdminToken } from './adminTokenService';
import { db } from './db';
import { clearEtherealSession } from './etherealTokenService';
import { stopAutoSync, waitForSyncIdle } from './syncService';

export const RESET_CRITICAL_LOCAL_STORAGE_KEYS = [
  'daybook-ai-settings',
  'daybook-sync-meta',
  'daybook-sync-owner-user-id',
  'daybook-sync-private',
  'daybook-admin-token',
  'daybook-admin-token-expiry',
  'ethereal-access-token',
  'ethereal-room-id',
  'ethereal-member-id',
  'ethereal-channel-key',
  'ethereal-expires-at',
  'ethereal-is-owner',
  'ethereal-display-name',
] as const;

export const RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS = [
  'daybook-last-backup',
  'daybook-backup-reminder-dismissed',
  'daybook-bio-settings',
  'daybook-attachment-counts-backfill-done',
  'ethereal-device-id',
] as const;

export type ResetStepId =
  | 'stopAutoSync'
  | 'signOutAuthSession'
  | 'clearAdminToken'
  | 'clearEtherealSession'
  | 'wipeAllDexieTables'
  | 'clearCriticalLocalStorageResidue'
  | 'clearNonCriticalLocalStorageResidue';

export interface ResetStepFailure {
  step: ResetStepId;
  message: string;
}

export type CriticalResidualId =
  | 'sync_activity'
  | 'auth_session'
  | 'local_daybook_data'
  | 'sync_owner_state'
  | 'admin_access_state'
  | 'ethereal_access_state';

export interface ResetAppStateResult {
  ok: boolean;
  status: 'full_success' | 'partial_success' | 'critical_failure';
  completedSteps: ResetStepId[];
  criticalFailures: ResetStepFailure[];
  nonCriticalFailures: ResetStepFailure[];
  criticalResiduals: CriticalResidualId[];
}

interface ResetAppStateParams {
  signOut: () => Promise<{ error: { message?: string } | null }>;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export async function resetAppState({ signOut }: ResetAppStateParams): Promise<ResetAppStateResult> {
  const completedSteps: ResetStepId[] = [];
  const criticalFailures: ResetStepFailure[] = [];
  const nonCriticalFailures: ResetStepFailure[] = [];
  const criticalStorageFailedKeys = new Set<string>();

  const executeStep = async (
    step: ResetStepId,
    critical: boolean,
    run: () => Promise<void> | void
  ): Promise<void> => {
    try {
      await run();
      completedSteps.push(step);
    } catch (error) {
      const failure: ResetStepFailure = {
        step,
        message: formatError(error),
      };
      if (critical) {
        criticalFailures.push(failure);
      } else {
        nonCriticalFailures.push(failure);
      }
    }
  };

  const clearLocalStorageKeys = (keys: readonly string[], failedKeySink?: Set<string>) => {
    const failedKeys: string[] = [];
    for (const key of keys) {
      try {
        localStorage.removeItem(key);
      } catch {
        failedKeys.push(key);
        failedKeySink?.add(key);
      }
    }
    if (failedKeys.length > 0) {
      throw new Error(`Failed to clear keys: ${failedKeys.join(', ')}`);
    }
  };

  const clearLocalStorageByPrefix = (prefix: string, failedKeySink?: Set<string>) => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    const failedKeys: string[] = [];
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        failedKeys.push(key);
        failedKeySink?.add(key);
      }
    }

    if (failedKeys.length > 0) {
      throw new Error(`Failed to clear keys: ${failedKeys.join(', ')}`);
    }
  };

  await executeStep('stopAutoSync', true, async () => {
    stopAutoSync();
    await waitForSyncIdle();
  });

  await executeStep('signOutAuthSession', true, async () => {
    const { error } = await signOut();
    if (error) {
      throw new Error(error.message || 'Sign out failed');
    }
  });

  await executeStep('clearAdminToken', true, () => {
    clearAdminToken();
  });

  await executeStep('clearEtherealSession', true, () => {
    clearEtherealSession();
  });

  await executeStep('wipeAllDexieTables', true, async () => {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  });

  await executeStep('clearCriticalLocalStorageResidue', true, () => {
    clearLocalStorageKeys(RESET_CRITICAL_LOCAL_STORAGE_KEYS, criticalStorageFailedKeys);
    clearLocalStorageByPrefix('daybook-sync-meta:', criticalStorageFailedKeys);
  });

  await executeStep('clearNonCriticalLocalStorageResidue', false, () => {
    clearLocalStorageKeys(RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS);
  });

  const status: ResetAppStateResult['status'] =
    criticalFailures.length > 0
      ? 'critical_failure'
      : nonCriticalFailures.length > 0
        ? 'partial_success'
        : 'full_success';

  const criticalResiduals = new Set<CriticalResidualId>();

  for (const failure of criticalFailures) {
    switch (failure.step) {
      case 'stopAutoSync':
        criticalResiduals.add('sync_activity');
        break;
      case 'signOutAuthSession':
        criticalResiduals.add('auth_session');
        break;
      case 'wipeAllDexieTables':
        criticalResiduals.add('local_daybook_data');
        break;
      case 'clearAdminToken':
        criticalResiduals.add('admin_access_state');
        break;
      case 'clearEtherealSession':
        criticalResiduals.add('ethereal_access_state');
        break;
      case 'clearCriticalLocalStorageResidue':
        break;
    }
  }

  for (const key of criticalStorageFailedKeys) {
    if (key === 'daybook-sync-owner-user-id' || key === 'daybook-sync-meta' || key.startsWith('daybook-sync-meta:')) {
      criticalResiduals.add('sync_owner_state');
    }
    if (key === 'daybook-admin-token' || key === 'daybook-admin-token-expiry') {
      criticalResiduals.add('admin_access_state');
    }
    if (key.startsWith('ethereal-')) {
      criticalResiduals.add('ethereal_access_state');
    }
  }

  return {
    ok: criticalFailures.length === 0,
    status,
    completedSteps,
    criticalFailures,
    nonCriticalFailures,
    criticalResiduals: Array.from(criticalResiduals),
  };
}
