
# План: Исправление критических багов в ZIP backup

## Обнаруженные проблемы

### 1. Неявные пути в JSZip (потенциальный баг)
**Текущий код:**
```typescript
const tablesFolder = zip.folder('tables');
const mediaFolder = zip.folder('media');
mediaFolder.file('attachments.json', ...);  // неявно создаёт media/attachments.json
```

**Проблема:** Хотя JSZip folder() работает корректно (создаёт media/attachments.json), это неявное поведение. При рефакторинге или смене версии JSZip может сломаться.

**Решение:** Использовать абсолютные пути через `zip.file()`:
```typescript
zip.file('media/attachments.json', ...);
zip.file(`media/${blobPath}`, blob);
zip.file('tables/drafts.json', ...);
```

### 2. bulkPut без чанков (критично для мобильных)
**Текущий код (строки 772-774):**
```typescript
const attachments = [];
// ... накапливаем все вложения ...
await db.attachments.bulkPut(attachments);  // ВСЕ СРАЗУ
```

**Проблема:** При 2000+ вложений с blob'ами это разнесёт память на мобильных устройствах.

**Решение:** Импорт чанками по 50 (меньше чем для JSON, т.к. blob'ы тяжелее):
```typescript
const CHUNK_SIZE = 50;
for (let i = 0; i < attachments.length; i += CHUNK_SIZE) {
  const chunk = attachments.slice(i, i + CHUNK_SIZE);
  await db.attachments.bulkPut(chunk);
}
```

### 3. Отсутствие тестов структуры ZIP
**Проблема:** Текущие тесты не проверяют, что ZIP содержит правильные файлы.

**Решение:** Добавить тесты без IndexedDB (мокаем db.table().toArray()):
```typescript
it('exports ZIP with correct structure', async () => {
  // Mock db tables
  vi.spyOn(db, 'table').mockImplementation((name) => ({
    toArray: () => Promise.resolve(mockData[name] || [])
  }));
  
  const zipBlob = await exportBackupZip();
  const zip = await JSZip.loadAsync(zipBlob);
  
  expect(zip.file('manifest.json')).toBeTruthy();
  expect(zip.file('tables/entries.json')).toBeTruthy();
  expect(zip.file('media/attachments.json')).toBeTruthy();
});
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/backupService.ts` | Абсолютные пути, chunked import |
| `src/lib/backupService.test.ts` | Добавить ZIP structure тесты |

---

## Детальные правки

### backupService.ts — exportBackupZip()

**Строки 420-444 (attachments export):**
```typescript
// БЫЛО:
mediaFolder.file(blobPath, att.blob);
mediaFolder.file(thumbPath, att.thumbnail);
mediaFolder.file('attachments.json', JSON.stringify(metadata, null, 2));

// СТАНЕТ:
zip.file(`media/${blobPath}`, att.blob);
zip.file(`media/${thumbPath}`, att.thumbnail);
zip.file('media/attachments.json', JSON.stringify(metadata, null, 2));
```

**Строки 456-481 (drafts export):**
```typescript
// БЫЛО:
mediaFolder.file(blobPath, att.blob);
mediaFolder.file(thumbPath, att.thumbnail);
tablesFolder.file('drafts.json', ...);

// СТАНЕТ:
zip.file(`media/${blobPath}`, att.blob);
zip.file(`media/${thumbPath}`, att.thumbnail);
zip.file('tables/drafts.json', ...);
```

**Строка 484 (regular tables):**
```typescript
// БЫЛО:
tablesFolder.file(`${tableName}.json`, JSON.stringify(rows, null, 2));

// СТАНЕТ:
zip.file(`tables/${tableName}.json`, JSON.stringify(rows, null, 2));
```

### backupService.ts — importBackupZip()

**Строки 750-774 (attachments import) — добавить chunked bulkPut:**
```typescript
const CHUNK_SIZE = 50;
const attachments: Array<...> = [];

for (let j = 0; j < metadata.length; j++) {
  // ... собираем attachment ...
  attachments.push({ ...rest, blob, thumbnail });
  
  // Flush chunk to DB
  if (attachments.length >= CHUNK_SIZE) {
    await db.attachments.bulkPut(attachments);
    attachments.length = 0; // clear array
  }
}

// Flush remaining
if (attachments.length > 0) {
  await db.attachments.bulkPut(attachments);
}
```

**Аналогично для drafts (строки 783-805).**

### backupService.test.ts — добавить ZIP structure тесты

```typescript
import JSZip from 'jszip';

describe('ZIP Structure', () => {
  it('exports ZIP with manifest.json', async () => {
    // Используем real export но с пустой DB
    const zipBlob = await exportBackupZip();
    const zip = await JSZip.loadAsync(zipBlob);
    
    const manifestFile = zip.file('manifest.json');
    expect(manifestFile).toBeTruthy();
    
    const manifestText = await manifestFile!.async('text');
    const manifest = JSON.parse(manifestText);
    expect(manifest.dbName).toBe('DaybookDB');
    expect(manifest.dbVersion).toBeGreaterThan(0);
  });

  it('exports tables/*.json for each table', async () => {
    const zipBlob = await exportBackupZip();
    const zip = await JSZip.loadAsync(zipBlob);
    
    expect(zip.file('tables/entries.json')).toBeTruthy();
    expect(zip.file('tables/biographies.json')).toBeTruthy();
    expect(zip.file('tables/reminders.json')).toBeTruthy();
  });

  it('exports media/attachments.json for attachment metadata', async () => {
    const zipBlob = await exportBackupZip();
    const zip = await JSZip.loadAsync(zipBlob);
    
    expect(zip.file('media/attachments.json')).toBeTruthy();
  });
});
```

---

## Контракт ZIP структуры (документация в коде)

Добавить комментарий в начало exportBackupZip():

```typescript
/**
 * ZIP Structure Contract:
 * 
 * daybook-backup-YYYY-MM-DD.zip
 * ├── manifest.json              # BackupManifest
 * ├── tables/
 * │   ├── entries.json           # Entry[]
 * │   ├── biographies.json       
 * │   ├── reminders.json         
 * │   ├── receipts.json          
 * │   ├── receiptItems.json      
 * │   ├── discussionSessions.json
 * │   ├── discussionMessages.json
 * │   ├── weeklyInsights.json    
 * │   ├── audioTranscripts.json  
 * │   ├── attachmentInsights.json
 * │   ├── analysisQueue.json     
 * │   ├── scanLogs.json          
 * │   └── drafts.json            # Draft[] with _blobPath references
 * └── media/
 *     ├── attachments.json       # Attachment metadata with _blobPath
 *     ├── att_<id>.<ext>         # Attachment blobs
 *     ├── att_<id>_thumb.<ext>   # Thumbnails
 *     └── draft_<id>_<idx>.<ext> # Draft attachment blobs
 */
```

---

## Порядок реализации

1. Исправить пути в exportBackupZip (абсолютные пути)
2. Добавить chunked import для attachments и drafts
3. Добавить ZIP structure тесты
4. Добавить контракт-комментарий
5. Прогнать тесты + ручной smoke test
