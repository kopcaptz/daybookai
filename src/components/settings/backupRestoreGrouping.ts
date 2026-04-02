import type { DetailedProgress, ImportSummary } from '@/lib/backupService';

export type BackupProgressLanguage = 'ru' | 'en' | 'he' | 'ar';
export type BackupProgressStatus = 'pending' | 'processing' | 'done';
export type BackupProgressGroupKey = 'journal-content' | 'discussions' | 'analysis' | 'task-record-data' | 'diagnostics';

export type BackupProgressGroupDefinition = {
  key: BackupProgressGroupKey;
  label: { ru: string; en: string; he: string; ar: string };
  importSummaryKeys: Array<keyof ImportSummary>;
  tableNames: string[];
};

export type GroupedImportSummaryItem = {
  key: BackupProgressGroupKey;
  label: string;
  count: number;
};

export type GroupedImportProgressItem = {
  name: string;
  status: BackupProgressStatus;
  total: number;
  current: number;
};

export const BACKUP_PROGRESS_GROUPS: BackupProgressGroupDefinition[] = [
  {
    key: 'journal-content',
    label: {
      ru: 'Дневниковый материал',
      en: 'Journal content',
      he: 'תוכן יומן',
      ar: 'محتوى اليوميات',
    },
    importSummaryKeys: ['entries', 'attachments', 'drafts'],
    tableNames: ['entries', 'attachments', 'drafts'],
  },
  {
    key: 'discussions',
    label: {
      ru: 'Обсуждения',
      en: 'Discussions',
      he: 'דיונים',
      ar: 'المناقشات',
    },
    importSummaryKeys: ['discussionSessions', 'discussionMessages'],
    tableNames: ['discussionSessions', 'discussionMessages'],
  },
  {
    key: 'analysis',
    label: {
      ru: 'Хроники и аналитические артефакты',
      en: 'Chronicles and analysis artifacts',
      he: 'כרוניקות וארטיפקטים אנליטיים',
      ar: 'السجلات والآثار التحليلية',
    },
    importSummaryKeys: ['biographies', 'weeklyInsights', 'attachmentInsights', 'audioTranscripts', 'analysisQueue'],
    tableNames: ['biographies', 'weeklyInsights', 'attachmentInsights', 'audioTranscripts', 'analysisQueue'],
  },
  {
    key: 'task-record-data',
    label: {
      ru: 'Напоминания и учётные записи',
      en: 'Reminders and record data',
      he: 'תזכורות ורשומות',
      ar: 'التذكيرات والسجلات',
    },
    importSummaryKeys: ['reminders', 'receipts', 'receiptItems'],
    tableNames: ['reminders', 'receipts', 'receiptItems'],
  },
  {
    key: 'diagnostics',
    label: {
      ru: 'Диагностика',
      en: 'Diagnostics',
      he: 'אבחון',
      ar: 'التشخيص',
    },
    importSummaryKeys: ['scanLogs'],
    tableNames: ['scanLogs'],
  },
];

export function getBackupProgressGroupLabel(group: BackupProgressGroupDefinition, language: BackupProgressLanguage) {
  return group.label[language];
}

export function getGroupedImportSummary(summary: ImportSummary, language: BackupProgressLanguage): GroupedImportSummaryItem[] {
  return BACKUP_PROGRESS_GROUPS.map((group) => ({
    key: group.key,
    label: getBackupProgressGroupLabel(group, language),
    count: group.importSummaryKeys.reduce((sum, key) => sum + summary[key], 0),
  })).filter((item) => item.count > 0);
}

export function collapseGroupedProgressStatus(statuses: BackupProgressStatus[]): BackupProgressStatus {
  if (statuses.length === 0) return 'pending';
  if (statuses.every((status) => status === 'done')) return 'done';
  if (statuses.some((status) => status === 'processing') || statuses.some((status) => status === 'done')) {
    return 'processing';
  }
  return 'pending';
}

export function getGroupedImportProgress(progress: DetailedProgress, language: BackupProgressLanguage): GroupedImportProgressItem[] {
  return BACKUP_PROGRESS_GROUPS.map((group) => {
    const groupTables = progress.tables.filter((table) => group.tableNames.includes(table.name));
    const total = groupTables.reduce((sum, table) => sum + (table.total ?? 0), 0);
    const current = groupTables.reduce((sum, table) => sum + (table.current ?? 0), 0);

    return {
      name: getBackupProgressGroupLabel(group, language),
      status: collapseGroupedProgressStatus(groupTables.map((table) => table.status)),
      total,
      current,
    };
  }).filter((group) => group.total > 0);
}
