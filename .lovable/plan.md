
# Очередь Анализа для Offline-режима

## Проблема

Сейчас если при сохранении записи пропал интернет или Edge Function недоступна:
1. `analyzeEntryInBackground()` падает с ошибкой
2. Ошибка логируется через `console.warn`
3. Запись остаётся **навсегда без анализа** (нет `semanticTags`, возможно неправильный `mood`)

```typescript
// Текущий код — ошибка просто игнорируется
analyzeEntryInBackground(...).catch(err => console.warn('[EntryAnalysis] Background error:', err));
```

---

## Решение: Analysis Queue в IndexedDB

### Новая таблица `analysisQueue`

```typescript
interface AnalysisQueueItem {
  id?: number;
  entryId: number;
  userSetMood: boolean;
  language: 'ru' | 'en';
  createdAt: number;
  lastAttempt?: number;
  attempts: number;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
}
```

### Логика работы

```text
┌─────────────────────────────────────────────────────────────────┐
│                      NewEntry.tsx                               │
│   [Сохранить] ──→ analyzeEntryInBackground()                    │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    │   Успех?    │                              │
│                    └──────┬──────┘                              │
│                     Да ↙     ↘ Нет                              │
│                   ✓ Done    ↓                                   │
│                         addToQueue(entryId)                     │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              analysisQueue (IndexedDB)                  │   │
│   │   entryId=42, attempts=0, status='pending'              │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               processAnalysisQueue() — Background Worker        │
│                                                                 │
│   Триггеры:                                                     │
│   • App startup (main.tsx)                                      │
│   • navigator.onLine event                                      │
│   • Каждые 5 минут (setInterval)                                │
│                                                                 │
│   Логика:                                                       │
│   1. Получить pending items (ORDER BY createdAt, LIMIT 5)       │
│   2. Для каждого:                                               │
│      - Проверить entry существует и не private                  │
│      - Вызвать Edge Function                                    │
│      - Успех → удалить из очереди                               │
│      - Ошибка → attempts++, если attempts >= 3 → status=failed  │
│   3. Между запросами: delay 500ms (rate limiting)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Изменения в файлах

### 1. src/lib/db.ts — Добавить таблицу

**Новый интерфейс:**
```typescript
export interface AnalysisQueueItem {
  id?: number;
  entryId: number;
  userSetMood: boolean;
  language: 'ru' | 'en';
  createdAt: number;
  lastAttempt?: number;
  attempts: number;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
}
```

**Dexie Version 12:**
```typescript
this.version(12).stores({
  // ... all existing tables ...
  analysisQueue: '++id, entryId, status, createdAt',
});
```

### 2. src/lib/entryAnalysisService.ts — Добавить queue logic

**Новые функции:**

```typescript
/**
 * Add entry to analysis queue (for retry later)
 */
export async function addToAnalysisQueue(
  entryId: number,
  userSetMood: boolean,
  language: 'ru' | 'en'
): Promise<void> {
  // Check if already queued
  const existing = await db.analysisQueue.where('entryId').equals(entryId).first();
  if (existing) return;
  
  await db.analysisQueue.add({
    entryId,
    userSetMood,
    language,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  });
  
  console.log(`[AnalysisQueue] Entry ${entryId} added to queue`);
}

/**
 * Process pending items in queue
 * Called on app startup, online event, and periodically
 */
export async function processAnalysisQueue(): Promise<void> {
  // Skip if offline
  if (!navigator.onLine) {
    console.log('[AnalysisQueue] Offline, skipping');
    return;
  }
  
  // Skip if AI not configured
  const aiSettings = loadAISettings();
  if (!aiSettings.enabled || !isAITokenValid()) {
    console.log('[AnalysisQueue] AI not ready, skipping');
    return;
  }
  
  // Get pending items (oldest first, max 5)
  const pending = await db.analysisQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
  
  const batch = pending.slice(0, 5);
  if (batch.length === 0) return;
  
  console.log(`[AnalysisQueue] Processing ${batch.length} items`);
  
  for (const item of batch) {
    try {
      // Mark as processing
      await db.analysisQueue.update(item.id!, { 
        status: 'processing',
        lastAttempt: Date.now(),
      });
      
      // Get entry
      const entry = await db.entries.get(item.entryId);
      if (!entry || entry.isPrivate || entry.aiAllowed === false) {
        // Entry deleted or now private — remove from queue
        await db.analysisQueue.delete(item.id!);
        continue;
      }
      
      // Already analyzed? Remove from queue
      if (entry.aiAnalyzedAt) {
        await db.analysisQueue.delete(item.id!);
        continue;
      }
      
      // Call AI
      const result = await callAnalyzeEdgeFunction(entry.text, entry.tags, item.language);
      
      // Update entry
      const updates: Partial<DiaryEntry> = {
        semanticTags: result.semanticTags,
        aiAnalyzedAt: Date.now(),
      };
      
      if (!item.userSetMood) {
        updates.mood = result.mood;
        updates.moodSource = 'ai';
      }
      
      await updateEntry(item.entryId, updates);
      
      // Success — remove from queue
      await db.analysisQueue.delete(item.id!);
      console.log(`[AnalysisQueue] Entry ${item.entryId} analyzed successfully`);
      
    } catch (error) {
      const attempts = item.attempts + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (attempts >= 3) {
        // Max retries — mark as failed
        await db.analysisQueue.update(item.id!, {
          status: 'failed',
          attempts,
          errorMessage,
        });
        console.warn(`[AnalysisQueue] Entry ${item.entryId} failed after ${attempts} attempts`);
      } else {
        // Will retry later
        await db.analysisQueue.update(item.id!, {
          status: 'pending',
          attempts,
          errorMessage,
        });
        console.log(`[AnalysisQueue] Entry ${item.entryId} retry ${attempts}/3`);
      }
    }
    
    // Rate limiting delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * Get queue stats (for debugging/settings)
 */
export async function getQueueStats(): Promise<{
  pending: number;
  failed: number;
}> {
  const [pending, failed] = await Promise.all([
    db.analysisQueue.where('status').equals('pending').count(),
    db.analysisQueue.where('status').equals('failed').count(),
  ]);
  return { pending, failed };
}

/**
 * Retry all failed items (reset to pending)
 */
export async function retryFailedAnalysis(): Promise<number> {
  const failed = await db.analysisQueue.where('status').equals('failed').toArray();
  
  for (const item of failed) {
    await db.analysisQueue.update(item.id!, {
      status: 'pending',
      attempts: 0,
      errorMessage: undefined,
    });
  }
  
  return failed.length;
}
```

**Изменить analyzeEntryInBackground:**

```typescript
export async function analyzeEntryInBackground(
  entryId: number,
  text: string,
  tags: string[],
  userSetMood: boolean,
  language: 'ru' | 'en'
): Promise<void> {
  // ... existing checks ...
  
  try {
    const result = await callAnalyzeEdgeFunction(text, tags, language);
    // ... update entry ...
    
  } catch (error) {
    console.warn('[EntryAnalysis] Failed:', error instanceof Error ? error.message : error);
    
    // NEW: Add to queue for retry
    await addToAnalysisQueue(entryId, userSetMood, language);
  }
}
```

### 3. src/main.tsx — Запуск процессора очереди

```typescript
import { processAnalysisQueue } from '@/lib/entryAnalysisService';

// Process queue on app startup
setTimeout(() => processAnalysisQueue(), 3000);

// Process queue when coming back online
window.addEventListener('online', () => {
  console.log('[App] Back online, processing analysis queue');
  processAnalysisQueue();
});

// Periodic processing (every 5 minutes)
setInterval(() => processAnalysisQueue(), 5 * 60 * 1000);
```

### 4. src/pages/SettingsPage.tsx — Опционально: показать статус очереди

В секции AI Settings:

```tsx
const [queueStats, setQueueStats] = useState({ pending: 0, failed: 0 });

useEffect(() => {
  getQueueStats().then(setQueueStats);
}, []);

// В UI, если есть pending/failed:
{(queueStats.pending > 0 || queueStats.failed > 0) && (
  <div className="text-xs text-muted-foreground">
    {queueStats.pending > 0 && `${queueStats.pending} в очереди анализа`}
    {queueStats.failed > 0 && (
      <>
        {queueStats.pending > 0 && ' • '}
        <button onClick={handleRetryFailed} className="underline">
          {queueStats.failed} не удалось — повторить
        </button>
      </>
    )}
  </div>
)}
```

---

## Обработка Edge Cases

| Сценарий | Поведение |
|----------|-----------|
| Запись удалена пока в очереди | При обработке проверяем existence, удаляем из очереди |
| Запись стала private | При обработке проверяем isPrivate, удаляем из очереди |
| Уже проанализирована (вручную) | Проверяем aiAnalyzedAt, удаляем из очереди |
| AI token истёк | Skip queue processing, подождёт до re-auth |
| 3+ неудачных попытки | status='failed', можно retry через Settings |

---

## Файлы для изменения

| Файл | Действие | Описание |
|------|----------|----------|
| `src/lib/db.ts` | Изменить | Добавить AnalysisQueueItem, версия 12 |
| `src/lib/entryAnalysisService.ts` | Изменить | Добавить queue functions |
| `src/main.tsx` | Изменить | Запустить processAnalysisQueue |
| `src/pages/SettingsPage.tsx` | Изменить | Показать статус очереди (опционально) |

---

## Оценка

| Метрика | Значение |
|---------|----------|
| Надёжность | Записи всегда будут проанализированы |
| Latency | Нулевая — сохранение не блокируется |
| Storage | ~100 bytes на item в очереди |
| Время реализации | ~45 минут |
