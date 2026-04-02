import { describe, expect, it } from 'vitest';
import { collapseGroupedProgressStatus, getGroupedImportProgress, getGroupedImportSummary } from './backupRestoreGrouping';

describe('backupRestoreGrouping', () => {
  it('groups import summary into product-shaped categories', () => {
    const result = getGroupedImportSummary({
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
    }, 'en');

    expect(result).toEqual([
      { key: 'journal-content', label: 'Journal content', count: 4 },
      { key: 'discussions', label: 'Discussions', count: 4 },
      { key: 'analysis', label: 'Chronicles and analysis artifacts', count: 5 },
    ]);
  });

  it('hides zero-total groups in grouped import progress', () => {
    const result = getGroupedImportProgress({
      overallPercent: 20,
      currentTable: 'entries',
      tables: [
        { name: 'entries', status: 'processing', current: 1, total: 1 },
        { name: 'attachments', status: 'pending', current: 0, total: 0 },
        { name: 'drafts', status: 'pending', current: 0, total: 0 },
        { name: 'discussionSessions', status: 'pending', current: 0, total: 0 },
        { name: 'discussionMessages', status: 'pending', current: 0, total: 0 },
        { name: 'biographies', status: 'pending', current: 0, total: 0 },
        { name: 'weeklyInsights', status: 'pending', current: 0, total: 0 },
        { name: 'audioTranscripts', status: 'pending', current: 0, total: 0 },
        { name: 'attachmentInsights', status: 'pending', current: 0, total: 0 },
        { name: 'analysisQueue', status: 'pending', current: 0, total: 0 },
        { name: 'reminders', status: 'pending', current: 0, total: 0 },
        { name: 'receipts', status: 'pending', current: 0, total: 0 },
        { name: 'receiptItems', status: 'pending', current: 0, total: 0 },
        { name: 'scanLogs', status: 'pending', current: 0, total: 0 },
      ],
    }, 'en');

    expect(result).toEqual([
      { name: 'Journal content', status: 'processing', current: 1, total: 1 },
    ]);
  });

  it('collapses raw table states into grouped status honestly', () => {
    expect(collapseGroupedProgressStatus(['done', 'done'])).toBe('done');
    expect(collapseGroupedProgressStatus(['done', 'pending'])).toBe('processing');
    expect(collapseGroupedProgressStatus(['processing', 'pending'])).toBe('processing');
    expect(collapseGroupedProgressStatus(['pending', 'pending'])).toBe('pending');
    expect(collapseGroupedProgressStatus([])).toBe('pending');
  });
});
