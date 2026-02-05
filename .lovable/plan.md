
# План: Полный бэкап и восстановление IndexedDB

## Анализ проблемы

### 1. Origin (домен) — подтверждение
- **Preview URL**: `https://id-preview--9fca1fba-dfe1-49a4-880b-c14ab9bec760.lovable.app`
- **Production URL**: `https://daybookai.lovable.app`

Это **разные origin** — у них разные IndexedDB. Данные из preview НЕ переносятся в production автоматически. Это ожидаемое поведение браузера.

Если пользователь работал в preview, а потом открыл production — он увидит пустую базу. Решение: **Export/Import Backup**.

### 2. Текущее состояние экспорта
Существующая функция `exportAllData()` экспортирует **только entries** — это неполный бэкап:
```typescript
export async function exportAllData(): Promise<string> {
  const entries = await getAllEntries();
  return JSON.stringify({ 
    entries, 
    exportedAt: new Date().toISOString(),
    note: 'Вложения (фото, видео, аудио) не экспортируются'
  }, null, 2);
}
```

Не экспортируются: `attachments`, `drafts`, `biographies`, `reminders`, `receipts`, `receiptItems`, `discussionSessions`, `discussionMessages`, `weeklyInsights`, `audioTranscripts`, `attachmentInsights`, `analysisQueue`.

---

## План реализации

### Шаг 1: Новый сервис `src/lib/backupService.ts`

Создать полноценный backup-сервис:

```text
+---------------------+
|   BackupManifest    |
+---------------------+
| dbName: string      |
| dbVersion: number   |
| exportedAt: string  |
| appVersion: string  |
| tables: {           |
|   [name]: count     |
| }                   |
+---------------------+

+---------------------+
|   BackupPayload     |
+---------------------+
| manifest            |
| entries[]           |
| attachments[]       | <- Blob → base64
| drafts[]            |
| biographies[]       |
| reminders[]         |
| receipts[]          |
| receiptItems[]      |
| discussionSessions[]|
| discussionMessages[]|
| weeklyInsights[]    |
| audioTranscripts[]  |
| attachmentInsights[]|
| analysisQueue[]     |
| scanLogs[]          |
+---------------------+
```

**Функции:**
- `exportFullBackup()` — сериализует все таблицы в JSON
  - Blob-ы конвертируются в base64 для портативности
  - Генерирует manifest с counts для валидации
- `validateBackupManifest(data)` — проверяет структуру и версию
- `importFullBackup(data, options)` — восстанавливает данные
  - `options.wipeExisting: boolean` — очистить перед импортом
  - Декодирует base64 обратно в Blob
  - Использует `bulkPut` для эффективной вставки

### Шаг 2: UI в Settings — карточка "Backup & Restore"

Добавить новую карточку между "Storage" и "Export Data":

```
┌─────────────────────────────────────┐
│ 💾 Backup & Restore                 │
│                                     │
│ ⚠️ Удаление приложения или очистка  │
│    данных сайта удаляет память.     │
│    Перед этим сделайте бэкап!       │
│                                     │
│ ┌─────────────────┐ ┌─────────────┐ │
│ │ 📤 Export       │ │ 📥 Import   │ │
│ │    Backup       │ │    Backup   │ │
│ └─────────────────┘ └─────────────┘ │
│                                     │
│ Последний бэкап: 05.02.2026 14:30   │
└─────────────────────────────────────┘
```

**Export:**
1. Показать прогресс (может занять время для больших баз)
2. Скачать файл `daybook-backup-YYYY-MM-DD.json`
3. Сохранить дату последнего бэкапа в localStorage

**Import:**
1. File picker для выбора .json
2. Валидация manifest
3. Показать summary: "Будет восстановлено: 42 записи, 15 чеков..."
4. AlertDialog с предупреждением: "Текущие данные будут заменены"
5. Прогресс импорта
6. Toast с результатом

### Шаг 3: i18n — новые ключи перевода

```typescript
// Backup & Restore
'backup.title': { ru: 'Резервное копирование', en: 'Backup & Restore', ... },
'backup.warning': { ru: 'Удаление приложения или очистка данных сайта удаляет память. Сделайте бэкап перед этим!', ... },
'backup.export': { ru: 'Экспорт бэкапа', en: 'Export Backup', ... },
'backup.import': { ru: 'Импорт бэкапа', en: 'Import Backup', ... },
'backup.exporting': { ru: 'Создание бэкапа...', en: 'Creating backup...', ... },
'backup.importing': { ru: 'Восстановление...', en: 'Restoring...', ... },
'backup.exportSuccess': { ru: 'Бэкап создан', en: 'Backup created', ... },
'backup.importSuccess': { ru: 'Данные восстановлены', en: 'Data restored', ... },
'backup.invalidFile': { ru: 'Неверный формат файла', en: 'Invalid file format', ... },
'backup.confirmImport': { ru: 'Восстановить данные?', en: 'Restore data?', ... },
'backup.confirmImportDesc': { ru: 'Текущие данные будут заменены данными из бэкапа.', en: 'Current data will be replaced with backup data.', ... },
'backup.lastBackup': { ru: 'Последний бэкап', en: 'Last backup', ... },
'backup.never': { ru: 'Никогда', en: 'Never', ... },
'backup.summary': { ru: 'Будет восстановлено', en: 'Will restore', ... },
```

### Шаг 4: Предупреждение в Clear Data

Обновить AlertDialog для "Clear Data":
- Добавить красное предупреждение: "Сначала сделайте Export Backup!"
- Ссылка на секцию Backup выше

---

## Детали реализации

### Конвертация Blob ↔ Base64
```typescript
// Blob → base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// base64 → Blob
function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
```

### Прогресс экспорта
Для больших баз с медиа (attachments) экспорт может занять время. Показываем:
```
Экспорт бэкапа...
├── Записи: 142 ✓
├── Вложения: 23/45 (обработка...)
├── Чеки: 15 ✓
└── ...
```

### Валидация manifest
```typescript
function validateBackupManifest(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  const manifest = (data as any).manifest;
  if (!manifest) return false;
  if (manifest.dbName !== 'DaybookDB') return false;
  if (typeof manifest.dbVersion !== 'number') return false;
  if (!manifest.exportedAt) return false;
  return true;
}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/backupService.ts` | **Новый** — логика export/import |
| `src/lib/i18n.tsx` | Добавить ключи backup.* |
| `src/pages/SettingsPage.tsx` | Добавить карточку Backup & Restore |
| `src/lib/db.ts` | Экспортировать `db` для доступа к таблицам |

---

## Ограничения

1. **Размер файла**: При большом количестве медиа файл может быть 100+ MB
2. **Производительность**: base64 увеличивает размер на ~33%
3. **Совместимость версий**: При импорте старого бэкапа в новую версию приложения Dexie применит миграции автоматически

---

## Альтернативный подход (опционально)

Для очень больших баз можно рассмотреть:
- ZIP-архив вместо JSON (уменьшит размер в ~5-10 раз)
- Требует библиотеку `jszip` (~50KB)
- Медиа-файлы как отдельные файлы в архиве
