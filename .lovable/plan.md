
# ТЗ: Исправление трёх критических пунктов

## Обзор

Реализация трёх обязательных улучшений для production-ready приложения:
1. **Централизованный логгер** — замена 285+ console.log на production-safe логгер
2. **Retention policy для ethereal_chronicle_revisions** — Edge Function cron для удаления старых ревизий
3. **End-to-end backup тесты** — интеграционные тесты с fake-indexeddb

---

## 1. Централизованный логгер

### 1.1 Проблема
- 285 вызовов `console.log` в 15 файлах
- 382 вызова всех console.* в 19 файлах (src/lib)
- В production логи видны всем
- Некоторые логи могут содержать чувствительные данные (entry IDs, mood values)

### 1.2 Решение

**Создать `src/lib/logger.ts`:**

```text
┌─────────────────────────────────────────────────────────────┐
│ Logger API                                                  │
├─────────────────────────────────────────────────────────────┤
│ logger.debug(tag, message, ...args)  — dev only             │
│ logger.info(tag, message, ...args)   — dev + staging        │
│ logger.warn(tag, message, ...args)   — all environments     │
│ logger.error(tag, message, ...args)  — all + crash reporter │
└─────────────────────────────────────────────────────────────┘
```

**Ключевые функции:**
- `isProduction` — проверка `import.meta.env.PROD`
- `maskSensitive(data)` — маскирует entryId, text, mood, email, etc.
- `formatMessage(tag, msg)` — форматирование `[Tag] Message`

**Конфигурация по уровням:**
```typescript
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

// Production: warn + error only
// Development: all levels
const currentLevel = import.meta.env.PROD ? LOG_LEVELS.warn : LOG_LEVELS.debug;
```

**Маскирование данных:**
```typescript
function maskSensitive(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    const masked = { ...value };
    // Mask sensitive fields
    if ('text' in masked) masked.text = '[REDACTED]';
    if ('content' in masked) masked.content = '[REDACTED]';
    if ('email' in masked) masked.email = '***@***';
    if ('pin' in masked) masked.pin = '****';
    // Truncate long strings
    // ...
    return masked;
  }
  return value;
}
```

### 1.3 Миграция console.log

**Приоритетные файлы (с чувствительными данными):**
1. `src/lib/entryAnalysisService.ts` — 20+ calls, содержит mood/tags
2. `src/lib/aiService.ts` — содержит API responses
3. `src/lib/biographyService.ts` — содержит biography text
4. `src/lib/backupService.ts` — содержит entry counts

**Паттерн замены:**
```typescript
// БЫЛО:
console.log(`[AnalysisQueue] Entry ${entryId} added to queue`);

// СТАЛО:
logger.debug('AnalysisQueue', 'Entry added to queue', { entryId });
```

### 1.4 Интеграция с CrashReporter

```typescript
// В logger.error автоматически отправляем в crash reporter
error(tag: string, message: string, error?: Error, ...args: unknown[]) {
  console.error(this.format(tag, message), ...args);
  
  if (error) {
    reportCrash({
      message: `[${tag}] ${message}`,
      stack: error.stack,
    });
  }
}
```

### 1.5 Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/logger.ts` | **НОВЫЙ** — централизованный логгер |
| `src/lib/entryAnalysisService.ts` | Заменить 20+ console.* |
| `src/lib/notifications.ts` | Заменить 10+ console.* |
| `src/lib/backupService.ts` | Заменить console.* |
| `src/lib/aiService.ts` | Заменить console.* |
| `src/lib/biographyService.ts` | Заменить console.* |
| `src/lib/crashReporter.ts` | Заменить console.* |
| `src/main.tsx` | Заменить console.* |
| (и другие 10+ файлов) | |

---

## 2. Retention Policy для ethereal_chronicle_revisions

### 2.1 Проблема
- Таблица `ethereal_chronicle_revisions` накапливает историю изменений
- Структура: `id, chronicle_id, editor_id, title_snapshot, content_snapshot, created_at`
- Нет механизма очистки старых записей
- Security scan предупреждает о потенциальном накоплении данных

### 2.2 Решение

**Создать Edge Function `supabase/functions/cleanup-revisions/index.ts`:**

```typescript
// Вызывается по cron (Supabase scheduled functions)
// Удаляет ревизии старше 30 дней, оставляя последние 5 для каждой хроники

Deno.serve(async (req) => {
  // Проверка авторизации (cron secret или admin)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const supabase = createClient(url, serviceKey);
  
  // Удалить ревизии старше 30 дней
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  const { data, error } = await supabase
    .from('ethereal_chronicle_revisions')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .select('id');
  
  const deletedCount = data?.length || 0;
  
  return new Response(JSON.stringify({ 
    deleted: deletedCount,
    cutoff: cutoffDate.toISOString(),
  }));
});
```

### 2.3 Альтернатива: Database Function

Если cron недоступен, создать SQL функцию:

```sql
CREATE OR REPLACE FUNCTION cleanup_old_revisions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete revisions older than 30 days
  -- Keep at least 3 most recent per chronicle
  WITH ranked AS (
    SELECT id, chronicle_id,
           ROW_NUMBER() OVER (PARTITION BY chronicle_id ORDER BY created_at DESC) as rn
    FROM ethereal_chronicle_revisions
  ),
  to_delete AS (
    SELECT r.id FROM ethereal_chronicle_revisions r
    JOIN ranked ON r.id = ranked.id
    WHERE r.created_at < NOW() - INTERVAL '30 days'
      AND ranked.rn > 3  -- Keep 3 most recent
  )
  DELETE FROM ethereal_chronicle_revisions
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
```

### 2.4 Конфигурация

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| `RETENTION_DAYS` | 30 | Достаточно для отката, не накапливает мусор |
| `MIN_KEEP_PER_CHRONICLE` | 3 | Всегда можно вернуться к недавним версиям |
| `RUN_FREQUENCY` | Daily 03:00 UTC | Низкая нагрузка |

### 2.5 Файлы для создания/изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/cleanup-revisions/index.ts` | **НОВЫЙ** |
| `supabase/config.toml` | Добавить `[functions.cleanup-revisions]` |
| `secrets` | Добавить `CRON_SECRET` |

---

## 3. End-to-End Backup тесты

### 3.1 Проблема
- Текущие тесты проверяют только валидацию структуры
- Нет тестов полного цикла export → import
- Нет тестов с реальными blob данными
- Нет тестов ZIP структуры

### 3.2 Решение

**Расширить `src/lib/backupService.test.ts`:**

```typescript
describe('Backup Service - Integration', () => {
  beforeEach(async () => {
    // Reset fake-indexeddb
    await db.delete();
    await db.open();
  });
  
  describe('Full Export/Import Cycle', () => {
    it('preserves entries through JSON export/import', async () => {
      // 1. Create test entries
      await db.entries.bulkAdd([
        { date: '2026-02-01', text: 'Entry 1', mood: 3, ... },
        { date: '2026-02-02', text: 'Entry 2', mood: 5, ... },
      ]);
      
      // 2. Export
      const payload = await exportFullBackup();
      
      // 3. Clear DB
      await db.entries.clear();
      
      // 4. Import
      await importFullBackup(payload, { wipeExisting: true });
      
      // 5. Verify
      const entries = await db.entries.toArray();
      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe('Entry 1');
    });
    
    it('preserves attachments with blobs', async () => {
      // Create entry with attachment
      const entryId = await db.entries.add({ ... });
      const blob = new Blob(['test-image-data'], { type: 'image/jpeg' });
      await db.attachments.add({
        entryId,
        kind: 'image',
        blob,
        ...
      });
      
      // Export -> Clear -> Import
      const payload = await exportFullBackup();
      await clearAllTables();
      await importFullBackup(payload);
      
      // Verify blob restored
      const att = await db.attachments.toArray();
      expect(att[0].blob).toBeInstanceOf(Blob);
      expect(att[0].blob.size).toBeGreaterThan(0);
    });
  });
  
  describe('ZIP Structure', () => {
    it('creates valid ZIP with correct paths', async () => {
      await db.entries.add({ ... });
      
      const zipBlob = await exportBackupZip();
      const zip = await JSZip.loadAsync(zipBlob);
      
      // Verify structure
      expect(zip.file('manifest.json')).toBeTruthy();
      expect(zip.file('tables/entries.json')).toBeTruthy();
      expect(zip.file('media/attachments.json')).toBeTruthy();
    });
    
    it('manifest counts match actual data', async () => {
      await db.entries.bulkAdd([...5 entries...]);
      
      const zipBlob = await exportBackupZip();
      const zip = await JSZip.loadAsync(zipBlob);
      
      const manifest = JSON.parse(
        await zip.file('manifest.json')!.async('text')
      );
      const entries = JSON.parse(
        await zip.file('tables/entries.json')!.async('text')
      );
      
      expect(manifest.tables.entries).toBe(entries.length);
    });
  });
  
  describe('ZIP Export/Import Cycle', () => {
    it('full cycle with attachments', async () => {
      // Setup
      const entryId = await db.entries.add({ ... });
      await db.attachments.add({
        entryId,
        blob: new Blob(['image'], { type: 'image/png' }),
        ...
      });
      
      // Export ZIP
      const zipBlob = await exportBackupZip();
      
      // Clear
      await clearAllTables();
      
      // Import ZIP
      await importBackupZip(zipBlob, { wipeExisting: true });
      
      // Verify
      const entries = await db.entries.toArray();
      const atts = await db.attachments.toArray();
      
      expect(entries).toHaveLength(1);
      expect(atts).toHaveLength(1);
      expect(atts[0].blob).toBeInstanceOf(Blob);
    });
  });
  
  describe('Edge Cases', () => {
    it('handles empty database', async () => {
      const payload = await exportFullBackup();
      expect(payload.manifest.tables.entries).toBe(0);
      
      await importFullBackup(payload);
      expect(await db.entries.count()).toBe(0);
    });
    
    it('handles large attachments', async () => {
      const largeBlob = new Blob([new ArrayBuffer(5 * 1024 * 1024)]); // 5MB
      await db.attachments.add({ blob: largeBlob, ... });
      
      const payload = await exportFullBackup();
      await clearAllTables();
      await importFullBackup(payload);
      
      const att = await db.attachments.toArray();
      expect(att[0].blob.size).toBe(5 * 1024 * 1024);
    });
    
    it('handles unicode in entry text', async () => {
      await db.entries.add({ text: '日本語テスト 🎉 émoji', ... });
      
      const payload = await exportFullBackup();
      await db.entries.clear();
      await importFullBackup(payload);
      
      const entry = await db.entries.toArray();
      expect(entry[0].text).toBe('日本語テスト 🎉 émoji');
    });
  });
});
```

### 3.3 Test Setup

```typescript
// src/test/setup.ts — добавить
import 'fake-indexeddb/auto';

// Ensure clean state
beforeEach(async () => {
  const { db } = await import('@/lib/db');
  await db.delete();
  await db.open();
});
```

### 3.4 Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/backupService.test.ts` | Добавить 10+ integration тестов |
| `src/test/setup.ts` | Настройка fake-indexeddb |
| `package.json` | Убедиться, что fake-indexeddb установлен |

---

## Порядок реализации

```text
┌─────────────────────────────────────────────────────────────┐
│ Фаза 1: Logger (минимальный риск, максимальный эффект)      │
│ ─────────────────────────────────────────────────────────── │
│ 1.1 Создать src/lib/logger.ts                               │
│ 1.2 Мигрировать entryAnalysisService.ts (тест на практике)  │
│ 1.3 Мигрировать остальные файлы                             │
│ 1.4 Прогнать тесты                                          │
├─────────────────────────────────────────────────────────────┤
│ Фаза 2: Backup тесты (проверяет существующий код)           │
│ ─────────────────────────────────────────────────────────── │
│ 2.1 Настроить fake-indexeddb в setup.ts                     │
│ 2.2 Написать integration тесты                              │
│ 2.3 Прогнать и пофиксить если что-то сломано                │
├─────────────────────────────────────────────────────────────┤
│ Фаза 3: Cleanup Edge Function (отдельная фича)              │
│ ─────────────────────────────────────────────────────────── │
│ 3.1 Создать Edge Function                                   │
│ 3.2 Добавить секрет CRON_SECRET                             │
│ 3.3 Протестировать вручную                                  │
│ 3.4 Настроить cron (если доступен)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Ожидаемый результат

После реализации:
- ✅ В production console чистая (только warn/error)
- ✅ Чувствительные данные не логируются
- ✅ Ревизии хроник автоматически очищаются через 30 дней
- ✅ Backup тесты покрывают полный цикл export→import
- ✅ Тесты проверяют ZIP структуру и blob integrity

---

## Оценка времени

| Задача | Сложность | Оценка |
|--------|-----------|--------|
| Logger + миграция | Medium | 1-2 часа |
| Backup integration тесты | Medium | 1 час |
| Cleanup Edge Function | Low | 30 мин |

**Итого: ~3-4 часа**
