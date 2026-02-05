/**
 * Backup Service Tests
 * Validates backup structure and validation functions
 * 
 * Note: Full E2E tests with IndexedDB are complex due to Dexie's singleton pattern
 * These tests focus on validation logic which can be tested reliably
 */

import { describe, it, expect } from 'vitest';
import {
  validateBackupManifest,
  validateZipManifest,
  getImportSummary,
  BackupPayload,
  BackupManifest,
} from './backupService';

describe('Backup Service', () => {
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
