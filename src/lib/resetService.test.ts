import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESET_CRITICAL_LOCAL_STORAGE_KEYS,
  RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS,
  resetAppState,
} from './resetService';

const {
  mockClearAdminToken,
  mockClearEtherealSession,
  mockStopAutoSync,
  mockWaitForSyncIdle,
  mockDbTransaction,
  mockTableClearOne,
  mockTableClearTwo,
} = vi.hoisted(() => ({
  mockClearAdminToken: vi.fn(),
  mockClearEtherealSession: vi.fn(),
  mockStopAutoSync: vi.fn(),
  mockWaitForSyncIdle: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockTableClearOne: vi.fn(),
  mockTableClearTwo: vi.fn(),
}));

vi.mock('./adminTokenService', () => ({
  clearAdminToken: mockClearAdminToken,
}));

vi.mock('./etherealTokenService', () => ({
  clearEtherealSession: mockClearEtherealSession,
}));

vi.mock('./syncService', () => ({
  stopAutoSync: mockStopAutoSync,
  waitForSyncIdle: mockWaitForSyncIdle,
}));

vi.mock('./db', () => ({
  db: {
    tables: [
      { clear: mockTableClearOne },
      { clear: mockTableClearTwo },
    ],
    transaction: mockDbTransaction,
  },
}));

describe('resetService', () => {
  beforeEach(() => {
    localStorage.clear();

    mockClearAdminToken.mockReset();
    mockClearEtherealSession.mockReset();
    mockStopAutoSync.mockReset();
    mockWaitForSyncIdle.mockReset();
    mockDbTransaction.mockReset();
    mockTableClearOne.mockReset();
    mockTableClearTwo.mockReset();

    mockWaitForSyncIdle.mockResolvedValue(undefined);
    mockTableClearOne.mockResolvedValue(undefined);
    mockTableClearTwo.mockResolvedValue(undefined);
    mockDbTransaction.mockImplementation(async (_mode: unknown, _tables: unknown, cb: () => Promise<void>) => {
      await cb();
    });
  });

  it('returns full_success when all critical and non-critical steps complete', async () => {
    for (const key of [...RESET_CRITICAL_LOCAL_STORAGE_KEYS, ...RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS]) {
      localStorage.setItem(key, 'value');
    }
    localStorage.setItem('daybook-sync-meta:user-123', 'value');

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await resetAppState({ signOut });

    expect(result.status).toBe('full_success');
    expect(result.ok).toBe(true);
    expect(result.criticalFailures).toHaveLength(0);
    expect(result.nonCriticalFailures).toHaveLength(0);
    expect(mockStopAutoSync).toHaveBeenCalledTimes(1);
    expect(mockWaitForSyncIdle).toHaveBeenCalledTimes(1);

    for (const key of [...RESET_CRITICAL_LOCAL_STORAGE_KEYS, ...RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem('daybook-sync-meta:user-123')).toBeNull();
  });

  it('returns partial_success when non-critical residue clear fails', async () => {
    const failingKey = RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS[0];
    for (const key of [...RESET_CRITICAL_LOCAL_STORAGE_KEYS, ...RESET_NON_CRITICAL_LOCAL_STORAGE_KEYS]) {
      localStorage.setItem(key, 'value');
    }

    const originalRemoveItem = Storage.prototype.removeItem;
    const removeSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (key === failingKey) {
          throw new Error('remove blocked');
        }
        return originalRemoveItem.call(this, key);
      });

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await resetAppState({ signOut });

    removeSpy.mockRestore();

    expect(result.status).toBe('partial_success');
    expect(result.ok).toBe(true);
    expect(result.criticalFailures).toHaveLength(0);
    expect(result.nonCriticalFailures).toHaveLength(1);
    expect(result.nonCriticalFailures[0].step).toBe('clearNonCriticalLocalStorageResidue');
    expect(result.nonCriticalFailures[0].message).toContain(failingKey);
  });

  it('returns critical_failure when sync does not become idle after stopAutoSync', async () => {
    mockWaitForSyncIdle.mockRejectedValueOnce(new Error('Timed out waiting for sync to become idle'));

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await resetAppState({ signOut });

    expect(result.status).toBe('critical_failure');
    expect(result.ok).toBe(false);
    expect(result.criticalFailures.some((failure) => failure.step === 'stopAutoSync')).toBe(true);
    expect(result.criticalResiduals).toContain('sync_activity');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('maps sign-out failure to auth_session residual without inventing owner/data residue', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: { message: 'Sign out failed' } });
    const result = await resetAppState({ signOut });

    expect(result.status).toBe('critical_failure');
    expect(result.criticalResiduals).toContain('auth_session');
    expect(result.criticalResiduals).not.toContain('sync_owner_state');
    expect(result.criticalResiduals).not.toContain('local_daybook_data');
  });

  it('maps critical localStorage key failures to authority-bearing residual buckets', async () => {
    for (const key of ['daybook-sync-owner-user-id', 'daybook-admin-token', 'ethereal-access-token']) {
      localStorage.setItem(key, 'value');
    }
    localStorage.setItem('daybook-sync-meta:user-123', 'value');

    const originalRemoveItem = Storage.prototype.removeItem;
    const removeSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (
          key === 'daybook-sync-owner-user-id' ||
          key === 'daybook-admin-token' ||
          key === 'ethereal-access-token' ||
          key === 'daybook-sync-meta:user-123'
        ) {
          throw new Error('remove blocked');
        }
        return originalRemoveItem.call(this, key);
      });

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await resetAppState({ signOut });

    removeSpy.mockRestore();

    expect(result.status).toBe('critical_failure');
    expect(result.criticalResiduals).toContain('sync_owner_state');
    expect(result.criticalResiduals).toContain('admin_access_state');
    expect(result.criticalResiduals).toContain('ethereal_access_state');
  });

  it('maps Dexie wipe failure to local_daybook_data residual', async () => {
    mockTableClearOne.mockRejectedValueOnce(new Error('Dexie clear failed'));

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await resetAppState({ signOut });

    expect(result.status).toBe('critical_failure');
    expect(result.criticalFailures.some((failure) => failure.step === 'wipeAllDexieTables')).toBe(true);
    expect(result.criticalResiduals).toContain('local_daybook_data');
  });
});
