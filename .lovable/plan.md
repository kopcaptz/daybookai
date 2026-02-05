
# План: Верификация и усиление Backup/Restore

## Обзор текущей реализации

### Что уже есть:
- `backupService.ts` — экспорт/импорт всех 14 таблиц IndexedDB
- Blob→base64 конвертация для attachments и drafts
- UI карточка в Settings с Export/Import кнопками
- Progress callback (частично используется)
- Валидация manifest (dbName, dbVersion, exportedAt)

### Что нужно улучшить:
1. Добавить тесты для проверки цикла export→import
2. ZIP формат вместо монолитного JSON
3. Защита (предупреждение о размере, полный progress UI)
4. Напоминание о бэкапе (14+ дней)

---

## Шаг 1: Unit/Integration тест для backup цикла

Создать файл `src/lib/backupService.test.ts`:

```text
describe('Backup Service')
├── it('exports all tables with correct manifest')
├── it('imports backup and restores data correctly')
├── it('validates backup manifest structure')
├── it('handles blob to base64 conversion')
└── it('handles base64 to blob conversion')
```

**Тестовые данные:**
- 3 entries (разные даты, mood, tags)
- 2 attachments (image + audio, включая blob)
- 1 biography

**Проверки:**
- manifest.tables counts === фактические counts после импорта
- Blob attachments читаются после импорта
- App не падает (нет исключений)

---

## Шаг 2: ZIP формат бэкапа (с JSZip)

### Установка зависимости
```json
"jszip": "^3.10.1"
```

### Структура ZIP файла
```
daybook-backup-2026-02-05.zip
├── manifest.json           # BackupManifest (dbName, dbVersion, appVersion, exportedAt, tables)
├── tables/
│   ├── entries.json
│   ├── biographies.json
│   ├── reminders.json
│   ├── receipts.json
│   ├── receiptItems.json
│   ├── discussionSessions.json
│   ├── discussionMessages.json
│   ├── weeklyInsights.json
│   ├── audioTranscripts.json
│   ├── attachmentInsights.json
│   ├── analysisQueue.json
│   └── scanLogs.json
└── media/
    ├── attachments.json     # metadata only (id, entryId, kind, mimeType, size, duration, createdAt)
    ├── att_1.jpeg           # actual blob files
    ├── att_1_thumb.jpeg     # thumbnails
    ├── att_2.mp3
    └── drafts.json          # includes draft attachments metadata
```

### Преимущества:
- Сжатие в ~5-10x меньше (особенно для текста)
- Медиа хранится как отдельные файлы (не base64 bloat)
- Легче дебажить (можно открыть и посмотреть)

### Новые функции в backupService.ts:
```typescript
// New exports
export async function exportBackupZip(onProgress?): Promise<Blob>
export async function importBackupZip(zipBlob: Blob, options, onProgress?): Promise<void>
export function validateZipManifest(data: unknown): boolean

// Helper
function getMimeExtension(mimeType: string): string
```

---

## Шаг 3: Улучшения UI в BackupRestoreCard

### 3.1 Предупреждение о большом размере
При экспорте, если оценочный размер > 50MB:
```
⚠️ Бэкап может быть большим (~XX MB)
   Убедитесь, что у вас достаточно места.
   [Продолжить] [Отмена]
```

Оценка размера:
```typescript
// Quick estimate before export
async function estimateBackupSize(): Promise<number> {
  const attachments = await db.attachments.toArray();
  let total = 0;
  for (const att of attachments) {
    total += att.blob.size;
    if (att.thumbnail) total += att.thumbnail.size;
  }
  // Add ~10% for JSON overhead
  return Math.round(total * 1.1);
}
```

### 3.2 Полный Progress UI
Текущее состояние показывает только текущую таблицу. Улучшаем:

```
┌─────────────────────────────────────┐
│ Экспорт бэкапа...                   │
│                                     │
│ [■■■■■■■■□□□□□□□□] 52%              │
│                                     │
│ ✓ entries (142)                     │
│ ✓ biographies (45)                  │
│ → attachments (23/47)               │
│ ○ reminders                         │
│ ○ receipts                          │
│ ...                                 │
└─────────────────────────────────────┘
```

Новый тип для детального прогресса:
```typescript
export interface DetailedProgress {
  phase: 'reading' | 'processing' | 'compressing' | 'complete';
  overallPercent: number;
  tables: Array<{
    name: string;
    status: 'pending' | 'processing' | 'done';
    current?: number;
    total?: number;
  }>;
}
```

### 3.3 Приватность — никаких логов с данными
```typescript
// ❌ НЕЛЬЗЯ
console.log('Processing entry:', entry.text);

// ✅ МОЖНО
console.log('[Backup] Processing entries:', entries.length);
```

Добавить ESLint правило или code review note.

---

## Шаг 4: Напоминание о бэкапе (14+ дней)

### Логика
```typescript
function shouldShowBackupReminder(): boolean {
  const lastBackup = getLastBackupDate();
  if (!lastBackup) return true; // Never backed up
  
  const daysSince = differenceInDays(new Date(), new Date(lastBackup));
  return daysSince >= 14;
}
```

### UI в SettingsPage
Маленький баннер над BackupRestoreCard:

```
┌─────────────────────────────────────┐
│ ⚠️ Последний бэкап: 18 дней назад   │
│    Рекомендуем сделать новый бэкап  │
│                          [Скрыть]   │
└─────────────────────────────────────┘
```

Dismiss сохраняет в localStorage (игнорировать до следующего бэкапа).

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `package.json` | Добавить `jszip: ^3.10.1` |
| `src/lib/backupService.ts` | Добавить ZIP export/import, estimateSize, DetailedProgress |
| `src/lib/backupService.test.ts` | **Новый** — unit тесты |
| `src/components/settings/BackupRestoreCard.tsx` | Улучшенный progress UI, size warning, file accept=".json,.zip" |
| `src/pages/SettingsPage.tsx` | Добавить BackupReminderBanner |

---

## Техническая детализация

### JSZip API (для справки)
```typescript
import JSZip from 'jszip';

// Create
const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest));
zip.file('tables/entries.json', JSON.stringify(entries));
zip.file('media/att_1.jpeg', blob);

// Generate
const zipBlob = await zip.generateAsync({ 
  type: 'blob',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 }
});

// Read
const zip = await JSZip.loadAsync(file);
const manifest = JSON.parse(await zip.file('manifest.json').async('text'));
const attBlob = await zip.file('media/att_1.jpeg').async('blob');
```

### Обратная совместимость
Import должен поддерживать оба формата:
1. `.json` — старый формат (монолитный JSON)
2. `.zip` — новый формат

```typescript
async function readBackupFile(file: File): Promise<BackupPayload> {
  if (file.name.endsWith('.zip')) {
    return readBackupZip(file);
  } else {
    return readBackupJson(file);
  }
}
```

---

## Порядок реализации

1. **Тесты** — написать тесты для текущей JSON-версии
2. **JSZip интеграция** — добавить ZIP export/import
3. **UI улучшения** — progress, size warning
4. **Напоминание** — 14-day banner
5. **Smoke test** — ручная проверка полного цикла

---

## Ожидаемый результат

После реализации:
- ✅ Тесты подтверждают, что export→import сохраняет все данные
- ✅ ZIP файлы в ~5x меньше JSON
- ✅ Пользователь видит прогресс каждой таблицы
- ✅ Предупреждение если бэкап > 50MB
- ✅ Напоминание если прошло 14+ дней
- ✅ Никаких приватных данных в console.log
