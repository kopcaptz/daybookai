
# Post-Save AI Analysis Pipeline

## Обзор

Реализация системы автоматического AI-анализа записей после сохранения. Агент будет определять настроение и генерировать семантические теги для улучшения поиска и контекста в Discussions.

---

## Архитектура

```text
┌──────────────────────────────────────────────────────────────────┐
│                        NewEntry.tsx                              │
│                                                                  │
│   [Сохранить] ─→ createEntry() ─→ IndexedDB                      │
│                        │                                         │
│                        ▼                                         │
│               analyzeEntryInBackground(entryId)                  │
│                        │                                         │
│                        ▼                                         │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │  Edge Function: ai-entry-analyze                           │ │
│   │  ─────────────────────────────────────────────────────────│ │
│   │  Input: { text, tags, language }                          │ │
│   │  Output: { mood, confidence, semanticTags[] }             │ │
│   │  Model: gemini-2.5-flash-lite (~$0.0001/запрос)           │ │
│   └────────────────────────────────────────────────────────────┘ │
│                        │                                         │
│                        ▼                                         │
│               updateEntry(id, { aiMood, semanticTags })          │
│                        │                                         │
│                        ▼                                         │
│                    IndexedDB                                     │
└──────────────────────────────────────────────────────────────────┘

             ┌───────────────────────────────────────┐
             │         Discussions Agent             │
             │                                       │
             │   buildContextPack()                  │
             │         │                             │
             │         ▼                             │
             │   Поиск по: text + tags + semanticTags│
             │         │                             │
             │         ▼                             │
             │   Более точные результаты             │
             └───────────────────────────────────────┘
```

---

## Логика определения настроения

| Условие | Действие |
|---------|----------|
| Пользователь выбрал mood ≠ 3 (по умолчанию) | Сохранить как есть, AI не переопределяет |
| Пользователь оставил mood = 3 (дефолт) | AI определяет mood и применяет автоматически |
| isPrivate = true | Пропустить AI анализ полностью |
| aiAllowed = false | Пропустить AI анализ полностью |

---

## Изменения в базе данных

### Расширение DiaryEntry (db.ts)

```typescript
export interface DiaryEntry {
  // Существующие поля...
  id?: number;
  date: string;
  text: string;
  mood: number;           // 1-5 (user-set or AI-set)
  tags: string[];         // visible user tags
  isPrivate: boolean;
  aiAllowed: boolean;
  createdAt: number;
  updatedAt: number;
  attachmentCounts?: AttachmentCounts;
  
  // НОВЫЕ ПОЛЯ:
  moodSource?: 'user' | 'ai';      // Кто установил mood
  semanticTags?: string[];          // AI-generated hidden tags
  aiAnalyzedAt?: number;            // Timestamp последнего анализа
}
```

### Миграция Dexie (Version 11)

```typescript
this.version(11).stores({
  entries: '++id, date, mood, *tags, *semanticTags, isPrivate, aiAllowed, createdAt, updatedAt',
  // остальные таблицы без изменений...
}).upgrade(tx => {
  return tx.table('entries').toCollection().modify(entry => {
    entry.moodSource = 'user';  // Все старые записи — user-set
    entry.semanticTags = [];
    entry.aiAnalyzedAt = undefined;
  });
});
```

---

## Edge Function: ai-entry-analyze

### Endpoint
`POST /functions/v1/ai-entry-analyze`

### Input
```typescript
interface AnalyzeEntryRequest {
  text: string;           // Текст записи
  tags: string[];         // Пользовательские теги
  language: 'ru' | 'en';  // Язык для ответа
}
```

### Output
```typescript
interface AnalyzeEntryResponse {
  mood: number;           // 1-5
  confidence: number;     // 0-1
  semanticTags: string[]; // 3-8 скрытых тегов для поиска
  requestId: string;
}
```

### Промпт для AI

```text
Analyze the following diary entry and return:
1. mood (1-5): emotional tone of the entry
   1 = very negative/sad/angry
   2 = somewhat negative/tired/frustrated  
   3 = neutral/calm/routine
   4 = positive/happy/satisfied
   5 = very positive/excited/grateful

2. semanticTags (3-8 tags): hidden search keywords that capture:
   - Main topics (work, family, health, hobby, travel, etc.)
   - Activities (meeting, exercise, cooking, reading, etc.)
   - Emotions (stress, joy, anxiety, peace, etc.)
   - Time patterns (morning routine, weekend, holiday, etc.)

Rules:
- Tags in lowercase, single words or short phrases
- Focus on searchable concepts, not style
- Include both explicit and implicit themes

Entry text:
"""
{text}
"""

User tags: [{tags}]

Return ONLY valid JSON:
{
  "mood": <number 1-5>,
  "confidence": <number 0-1>,
  "semanticTags": ["tag1", "tag2", ...]
}
```

---

## Клиентский сервис

### entryAnalysisService.ts

```typescript
interface AnalysisResult {
  mood: number;
  confidence: number;
  semanticTags: string[];
}

/**
 * Анализирует запись через AI после сохранения
 * Вызывается в фоне, не блокирует UI
 */
export async function analyzeEntryInBackground(
  entryId: number,
  text: string,
  tags: string[],
  userSetMood: boolean,  // true если пользователь явно выбрал mood
  language: 'ru' | 'en'
): Promise<void> {
  // Проверки...
  
  try {
    const result = await callAnalyzeEdgeFunction(text, tags, language);
    
    const updates: Partial<DiaryEntry> = {
      semanticTags: result.semanticTags,
      aiAnalyzedAt: Date.now(),
    };
    
    // Применяем AI mood только если user не выбирал сам
    if (!userSetMood) {
      updates.mood = result.mood;
      updates.moodSource = 'ai';
    }
    
    await updateEntry(entryId, updates);
    
  } catch (error) {
    console.warn('[EntryAnalysis] Failed:', error);
    // Тихо проглатываем ошибку — анализ опционален
  }
}
```

---

## Интеграция в NewEntry.tsx

### Отслеживание user override

```typescript
// Добавить состояние
const [userChangedMood, setUserChangedMood] = useState(false);

// Изменить handleMoodChange
const handleMoodChange = (newMood: number) => {
  setMood(newMood);
  setUserChangedMood(true);  // Пользователь явно выбрал
  // ...existing code
};
```

### Вызов анализа после сохранения

```typescript
// В handleSave, после успешного сохранения:
if (saveSuccess && !isPrivate && savedEntry.aiAllowed) {
  // Запускаем анализ в фоне (не ждём)
  analyzeEntryInBackground(
    entryId,
    text,
    tags,
    userChangedMood || mood !== 3,  // User override если менял или не дефолт
    language
  ).catch(console.warn);
}
```

---

## Улучшение поиска в Discussions

### contextPack.ts — расширенный поиск

```typescript
function calculateRelevanceScore(
  entry: DiaryEntry, 
  query: string
): number {
  const lowerQuery = query.toLowerCase();
  const keywords = lowerQuery.split(/\s+/).filter(k => k.length > 2);
  
  let score = 0;
  
  // 1. Поиск по тексту (существующий)
  for (const keyword of keywords) {
    if (entry.text.toLowerCase().includes(keyword)) {
      score += 1;
    }
  }
  
  // 2. Поиск по visible tags (существующий)
  for (const tag of entry.tags) {
    if (keywords.some(k => tag.toLowerCase().includes(k))) {
      score += 1.5;  // Теги важнее
    }
  }
  
  // 3. НОВОЕ: Поиск по semantic tags
  if (entry.semanticTags) {
    for (const stag of entry.semanticTags) {
      if (keywords.some(k => stag.toLowerCase().includes(k))) {
        score += 2;  // Семантические теги ещё важнее
      }
    }
  }
  
  return score;
}
```

---

## Файлы для создания/изменения

| Файл | Действие | Описание |
|------|----------|----------|
| `src/lib/db.ts` | Изменить | Добавить поля в DiaryEntry, миграция v11 |
| `src/lib/entryAnalysisService.ts` | Создать | Сервис фонового AI анализа |
| `supabase/functions/ai-entry-analyze/index.ts` | Создать | Edge Function для анализа |
| `supabase/config.toml` | Изменить | Добавить новую функцию |
| `src/pages/NewEntry.tsx` | Изменить | Интегрировать вызов анализа |
| `src/lib/librarian/contextPack.ts` | Изменить | Поиск по semanticTags |

---

## Обработка ошибок

| Сценарий | Поведение |
|----------|-----------|
| AI недоступен | Запись сохраняется без анализа |
| Rate limit (429) | Тихое логирование, retry не нужен |
| Невалидный ответ | Игнорируем, оставляем как есть |
| isPrivate entry | Пропускаем анализ полностью |

---

## Безопасность и приватность

1. **Приватные записи**: Полностью исключены из анализа
2. **Логирование**: Только metadata (entryId, model, latency), никогда текст
3. **semanticTags**: Хранятся локально в IndexedDB, не синхронизируются
4. **AI Token**: Требуется для вызова Edge Function

---

## Оценка

| Метрика | Значение |
|---------|----------|
| Стоимость | ~$0.0001/запись |
| Latency | ~500-800ms (фоновая) |
| Время разработки | ~2 часа |
| Модель | gemini-2.5-flash-lite |
