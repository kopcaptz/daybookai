/**
 * Backup Service Tests
 * Validates backup structure and validation functions
 * 
 * Note: Full E2E tests with IndexedDB are complex due to Dexie's singleton pattern
 * These tests focus on validation logic which can be tested reliably
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';

const mocks = vi.hoisted(() => ({
  getSyncOwnerUserId: vi.fn(),
  bindSyncOwnershipIfUnbound: vi.fn(),
  dbTransaction: vi.fn(),
  dbTable: vi.fn(),
  tableBulkPut: vi.fn(),
  tableClearOne: vi.fn(),
  tableClearTwo: vi.fn(),
}));

vi.mock('./syncService', () => ({
  getSyncOwnerUserId: mocks.getSyncOwnerUserId,
  bindSyncOwnershipIfUnbound: mocks.bindSyncOwnershipIfUnbound,
}));

vi.mock('./db', () => ({
  db: {
    verno: 15,
    tables: [
      { clear: mocks.tableClearOne },
      { clear: mocks.tableClearTwo },
    ],
    transaction: mocks.dbTransaction,
    table: mocks.dbTable,
  },
}));

import {
  evaluateRestoreProvenance,
  importBackupZip,
  importFullBackup,
  planRestoreImportOwnership,
  validateBackupManifest,
  validateZipManifest,
  getImportSummary,
  BackupPayload,
  BackupManifest,
} from './backupService';

function makePayload(ownerUserId?: string | null): BackupPayload {
  return {
    manifest: {
      dbName: 'DaybookDB',
      dbVersion: 15,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '1.0.0',
      ownerUserId,
      tables: {},
    },
    entries: [],
    attachments: [],
    drafts: [],
    biographies: [],
    reminders: [],
    receipts: [],
    receiptItems: [],
    discussionSessions: [],
    discussionMessages: [],
    weeklyInsights: [],
    audioTranscripts: [],
    attachmentInsights: [],
    analysisQueue: [],
    scanLogs: [],
  };
}

describe('Backup Service', () => {
  beforeEach(() => {
    mocks.getSyncOwnerUserId.mockReset();
    mocks.bindSyncOwnershipIfUnbound.mockReset();
    mocks.dbTransaction.mockReset();
    mocks.dbTable.mockReset();
    mocks.tableBulkPut.mockReset();
    mocks.tableClearOne.mockReset();
    mocks.tableClearTwo.mockReset();

    mocks.getSyncOwnerUserId.mockReturnValue(null);
    mocks.tableBulkPut.mockResolvedValue(undefined);
    mocks.tableClearOne.mockResolvedValue(undefined);
    mocks.tableClearTwo.mockResolvedValue(undefined);
    mocks.dbTable.mockImplementation(() => ({
      bulkPut: mocks.tableBulkPut,
    }));
    mocks.dbTransaction.mockImplementation(async (_mode: unknown, _tables: unknown, cb: () => Promise<void>) => {
      await cb();
    });
  });

  describe('validateBackupManifest', () => {
    it('returns false for null/undefined', () => {
      expect(validateBackupManifest(null)).toBe(false);
      expect(validateBackupManifest(undefined)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(validateBackupManifest('string')).toBe(false);
      expect(validateBackupManifest(123)).toBe(false);
    });

    it('returns false if manifest is missing', () => {
      expect(validateBackupManifest({ entries: [] })).toBe(false);
    });

    it('returns false if dbName is wrong', () => {
      expect(validateBackupManifest({
        manifest: { dbName: 'WrongDB', dbVersion: 15, exportedAt: '2026-01-01' },
        entries: [],
        attachments: [],
        drafts: [],
      })).toBe(false);
    });

    it('returns true for valid backup payload', () => {
      expect(validateBackupManifest({
        manifest: { 
          dbName: 'DaybookDB', 
          dbVersion: 15, 
          exportedAt: '2026-01-01T00:00:00.000Z',
          appVersion: '1.0.0',
          tables: { entries: 0 }
        },
        entries: [],
        attachments: [],
        drafts: [],
      })).toBe(true);
    });

    it('validates required table arrays exist', () => {
      // Missing attachments array
      expect(validateBackupManifest({
        manifest: { 
          dbName: 'DaybookDB', 
          dbVersion: 15, 
          exportedAt: '2026-01-01T00:00:00.000Z',
          appVersion: '1.0.0',
          tables: {}
        },
        entries: [],
        drafts: [],
      })).toBe(false);
    });
  });

  describe('validateZipManifest', () => {
    it('returns false for invalid manifest', () => {
      expect(validateZipManifest(null)).toBe(false);
      expect(validateZipManifest({})).toBe(false);
      expect(validateZipManifest({ dbName: 'Wrong' })).toBe(false);
    });

    it('returns false for missing required fields', () => {
      expect(validateZipManifest({ dbName: 'DaybookDB' })).toBe(false);
      expect(validateZipManifest({ dbName: 'DaybookDB', dbVersion: 'invalid' })).toBe(false);
    });

    it('returns true for valid manifest', () => {
      const validManifest: BackupManifest = {
        dbName: 'DaybookDB',
        dbVersion: 15,
        exportedAt: '2026-01-01T00:00:00.000Z',
        appVersion: '1.0.0',
        tables: { entries: 5 },
      };
      expect(validateZipManifest(validManifest)).toBe(true);
    });

    it('accepts manifest with zero entries', () => {
      const emptyManifest: BackupManifest = {
        dbName: 'DaybookDB',
        dbVersion: 15,
        exportedAt: '2026-01-01T00:00:00.000Z',
        appVersion: '1.0.0',
        tables: { entries: 0, attachments: 0, drafts: 0 },
      };
      expect(validateZipManifest(emptyManifest)).toBe(true);
    });
  });

  describe('getImportSummary', () => {
    it('returns correct counts for all tables', () => {
      const payload: BackupPayload = {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01',
          appVersion: '1.0.0',
          tables: {},
        },
        entries: [{}, {}, {}],
        attachments: [{}, {}],
        drafts: [],
        biographies: [{}],
        reminders: [],
        receipts: [{}, {}, {}, {}],
        receiptItems: [],
        discussionSessions: [],
        discussionMessages: [],
        weeklyInsights: [],
        audioTranscripts: [],
        attachmentInsights: [],
        analysisQueue: [],
        scanLogs: [],
      };

      const summary = getImportSummary(payload);
      expect(summary.entries).toBe(3);
      expect(summary.attachments).toBe(2);
      expect(summary.biographies).toBe(1);
      expect(summary.receipts).toBe(4);
      expect(summary.drafts).toBe(0);
      expect(summary.reminders).toBe(0);
    });

    it('handles missing optional tables gracefully', () => {
      const minimalPayload = {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01',
          appVersion: '1.0.0',
          tables: {},
        },
        entries: [],
        attachments: [],
        drafts: [],
      } as BackupPayload;

      const summary = getImportSummary(minimalPayload);
      expect(summary.entries).toBe(0);
      expect(summary.attachments).toBe(0);
      expect(summary.biographies).toBe(0);
      expect(summary.receipts).toBe(0);
    });

    it('returns accurate counts for large datasets', () => {
      const largePayload: BackupPayload = {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01',
          appVersion: '1.0.0',
          tables: {},
        },
        entries: Array(500).fill({}),
        attachments: Array(1000).fill({}),
        drafts: Array(10).fill({}),
        biographies: Array(365).fill({}),
        reminders: Array(50).fill({}),
        receipts: Array(200).fill({}),
        receiptItems: Array(1500).fill({}),
        discussionSessions: Array(25).fill({}),
        discussionMessages: Array(300).fill({}),
        weeklyInsights: Array(52).fill({}),
        audioTranscripts: Array(100).fill({}),
        attachmentInsights: Array(100).fill({}),
        analysisQueue: Array(5).fill({}),
        scanLogs: Array(50).fill({}),
      };

      const summary = getImportSummary(largePayload);
      expect(summary.entries).toBe(500);
      expect(summary.attachments).toBe(1000);
      expect(summary.receipts).toBe(200);
      expect(summary.receiptItems).toBe(1500);
    });
  });

  describe('evaluateRestoreProvenance', () => {
    it('allows restore when device owner matches backup owner', () => {
      expect(evaluateRestoreProvenance({
        deviceOwnerUserId: 'owner-123',
        backupOwnerUserId: 'owner-123',
      })).toEqual({ allowed: true });
    });

    it('denies restore when device owner differs from backup owner', () => {
      expect(evaluateRestoreProvenance({
        deviceOwnerUserId: 'owner-123',
        backupOwnerUserId: 'owner-456',
      })).toEqual({ allowed: false, reason: 'owner_mismatch' });
    });

    it('denies restore with missing provenance on owner-bound device', () => {
      expect(evaluateRestoreProvenance({
        deviceOwnerUserId: 'owner-123',
        backupOwnerUserId: null,
      })).toEqual({ allowed: false, reason: 'missing_provenance' });
    });

    it('allows missing-provenance backup on clean device', () => {
      expect(evaluateRestoreProvenance({
        deviceOwnerUserId: null,
        backupOwnerUserId: undefined,
      })).toEqual({ allowed: true });
    });
  });

  describe('planRestoreImportOwnership', () => {
    it('returns an owner to bind for allowed ownerful imports', () => {
      expect(planRestoreImportOwnership({
        deviceOwnerUserId: null,
        backupOwnerUserId: 'owner-123',
      })).toEqual({ allowed: true, ownerUserIdToBind: 'owner-123' });
    });

    it('keeps clean-device missing-provenance imports unbound', () => {
      expect(planRestoreImportOwnership({
        deviceOwnerUserId: null,
        backupOwnerUserId: undefined,
      })).toEqual({ allowed: true, ownerUserIdToBind: null });
    });

    it('rejects foreign-owner imports without a binding target', () => {
      expect(planRestoreImportOwnership({
        deviceOwnerUserId: 'owner-123',
        backupOwnerUserId: 'owner-456',
      })).toEqual({ allowed: false, reason: 'owner_mismatch', ownerUserIdToBind: null });
    });
  });

  describe('import ownership binding', () => {
    it('rejects foreign-owner JSON import before destructive work', async () => {
      mocks.getSyncOwnerUserId.mockReturnValue('owner-123');

      await expect(importFullBackup(makePayload('owner-456'))).rejects.toThrow('Restore denied: owner_mismatch');

      expect(mocks.dbTransaction).not.toHaveBeenCalled();
      expect(mocks.tableClearOne).not.toHaveBeenCalled();
      expect(mocks.tableClearTwo).not.toHaveBeenCalled();
      expect(mocks.bindSyncOwnershipIfUnbound).not.toHaveBeenCalled();
    });

    it('binds owner after successful ownerful JSON import on a clean device', async () => {
      const payload = makePayload('owner-123');
      payload.entries = [{ id: 1, text: 'entry' }];

      await importFullBackup(payload);

      expect(mocks.tableBulkPut).toHaveBeenCalled();
      expect(mocks.bindSyncOwnershipIfUnbound).toHaveBeenCalledWith('owner-123');
    });

    it('allows missing-provenance JSON import on a clean device and stays unbound', async () => {
      const payload = makePayload(undefined);
      payload.entries = [{ id: 1, text: 'entry' }];

      await importFullBackup(payload);

      expect(mocks.bindSyncOwnershipIfUnbound).not.toHaveBeenCalled();
    });

    it('does not bind owner when JSON import fails', async () => {
      const payload = makePayload('owner-123');
      payload.entries = [{ id: 1, text: 'entry' }];
      mocks.tableBulkPut.mockRejectedValueOnce(new Error('bulk failed'));

      await expect(importFullBackup(payload)).rejects.toThrow('bulk failed');

      expect(mocks.bindSyncOwnershipIfUnbound).not.toHaveBeenCalled();
    });

    it('binds owner after successful ownerful ZIP import on a clean device', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({
        dbName: 'DaybookDB',
        dbVersion: 15,
        exportedAt: '2026-01-01T00:00:00.000Z',
        appVersion: '1.0.0',
        ownerUserId: 'owner-123',
        tables: {},
      }));
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      await importBackupZip(zipBlob);

      expect(mocks.bindSyncOwnershipIfUnbound).toHaveBeenCalledWith('owner-123');
    });
  });

  describe('Payload Structure Validation', () => {
    it('validates complete payload structure', () => {
      const completePayload = {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: new Date().toISOString(),
          appVersion: '1.0.0',
          tables: {
            entries: 1,
            attachments: 0,
            drafts: 0,
          },
        },
        entries: [{ id: 1, text: 'Test entry' }],
        attachments: [],
        drafts: [],
        biographies: [],
        reminders: [],
        receipts: [],
        receiptItems: [],
        discussionSessions: [],
        discussionMessages: [],
        weeklyInsights: [],
        audioTranscripts: [],
        attachmentInsights: [],
        analysisQueue: [],
        scanLogs: [],
      };

      expect(validateBackupManifest(completePayload)).toBe(true);
    });

    it('rejects payloads with non-array table data', () => {
      const invalidPayload = {
        manifest: {
          dbName: 'DaybookDB',
          dbVersion: 15,
          exportedAt: '2026-01-01',
          appVersion: '1.0.0',
          tables: {},
        },
        entries: 'not an array', // Invalid
        attachments: [],
        drafts: [],
      };

      expect(validateBackupManifest(invalidPayload)).toBe(false);
    });
  });
});
