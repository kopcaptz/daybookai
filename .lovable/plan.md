
# Итеративный План: AI-Улучшения Кибер-Гримуара

## Обзор стратегии

На основе вашего анализа реализуем три ключевых улучшения в порядке приоритета:

| Приоритет | Функция | Влияние на метрики | Сложность |
|-----------|---------|-------------------|-----------|
| 1 | **Mood Predictor v2** | Точность 60%→85% | Средняя |
| 2 | **Smart Entry Titles** | UX + Retention ↑ | Низкая |
| 3 | **Weekly Insights AI** | Retention + Engagement ↑ | Средняя |

---

## Фаза 1: Mood Predictor v2 (AI Context-Aware)

### Проблема текущей реализации

```text
sentimentService.ts (keyword-based):
┌────────────────────────────────────────────────┐
│  "Это было ужасно круто"                       │
│  ────────────────────────────────────────────  │
│  Keyword match: "ужасно" → negative            │
│  Result: mood = 2 ❌ (должно быть 5)           │
└────────────────────────────────────────────────┘

ai-entry-analyze (context-aware):
┌────────────────────────────────────────────────┐
│  AI понимает: "ужасно круто" = усиление        │
│  Result: mood = 5 ✓                            │
└────────────────────────────────────────────────┘
```

### Решение: Unified AI Mood Endpoint

Расширить `ai-entry-analyze` для real-time prediction:

```text
┌───────────────────────────────────────────────────────────────────┐
│                    ai-entry-analyze (расширенный)                 │
│                                                                   │
│  mode: "full"      → mood + confidence + semanticTags            │
│  mode: "quick"     → mood + confidence (для live prediction)     │
│                                                                   │
│  "quick" режим:                                                   │
│  - Короче промпт                                                  │
│  - max_tokens: 50                                                 │
│  - ~200ms latency (flash-lite)                                    │
└───────────────────────────────────────────────────────────────────┘
```

### Изменения в файлах

**1. supabase/functions/ai-entry-analyze/index.ts**

```typescript
interface AnalyzeRequest {
  text: string;
  tags: string[];
  language: "ru" | "en";
  mode?: "full" | "quick";  // NEW: quick для live prediction
}

// Quick mode промпт (короче = быстрее + дешевле)
const quickPromptRu = `Определи эмоциональный тон текста (1-5):
1=негатив, 2=усталость, 3=нейтрально, 4=позитив, 5=восторг
Учитывай контекст, иронию, идиомы ("ужасно круто"=позитив).
JSON: {"mood":N,"confidence":0.X}`;

// Full mode остаётся как есть (с semanticTags)
```

**2. src/hooks/usePredictiveMood.ts**

Заменить локальный анализ на AI с умным fallback:

```typescript
// Новая логика:
// 1. Локальный instant-preview (для немедленного отклика)
// 2. AI вызов на паузе печати (2 сек) или onBlur
// 3. AI результат перезаписывает локальный

interface UsePredictiveMoodOptions {
  // ... existing
  aiEnabled?: boolean;        // default: true если online
  aiDebounceMs?: number;      // default: 2000
  maxAICallsPerEntry?: number; // default: 3
}

// Добавить состояния:
const [aiSuggestedMood, setAISuggestedMood] = useState<number | null>(null);
const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
const [aiCallCount, setAICallCount] = useState(0);
const lastAITextRef = useRef('');

// AI вызов через Supabase:
const callQuickMoodAnalysis = async (text: string) => {
  if (aiCallCount >= maxAICallsPerEntry) return;
  if (text === lastAITextRef.current) return;
  
  setIsAIAnalyzing(true);
  try {
    const { data } = await supabase.functions.invoke('ai-entry-analyze', {
      body: { text, tags: [], language, mode: 'quick' }
    });
    if (data?.mood) {
      setAISuggestedMood(data.mood);
      setAICallCount(prev => prev + 1);
      lastAITextRef.current = text;
    }
  } finally {
    setIsAIAnalyzing(false);
  }
};
```

**3. src/lib/sentimentService.ts**

Оставить как fallback для offline:

```typescript
// Повысить threshold до 0.5 (уменьшить ложные срабатывания)
const CONFIDENCE_THRESHOLD = 0.5;

// Добавить функцию для instant-preview:
export function getInstantMoodHint(text: string): number | null {
  const result = analyzeSentimentLocal(text);
  // Показывать только если очень уверены
  return result.confidence >= 0.6 ? result.mood : null;
}
```

**4. src/components/MoodSelector.tsx**

Индикация источника:

```typescript
// Новые пропсы:
interface MoodSelectorProps {
  // ... existing
  analysisSource?: 'local' | 'ai' | null;
  isAIAnalyzing?: boolean;
}

// UI индикаторы:
// 🧠 пульс → локальный анализ
// ✨ пульс → AI анализирует
// ✨ → AI подтвердил
// ✓ → совпадает с выбором
```

---

## Фаза 2: Smart Entry Titles (Быстрая победа)

### Концепция

```text
┌──────────────────────────────────────────────────────────────┐
│  Входной текст:                                              │
│  "Сегодня встретился с командой. Обсудили новый проект,     │
│   много интересных идей. Потом пошли обедать."              │
│                                                              │
│  AI Title (кибер-стиль):                                     │
│  "Резонанс в секторе Команда: Контур нового проекта"        │
│                                                              │
│  Fallback (если AI недоступен):                              │
│  "15:42 • Встреча, команда, проект"                         │
└──────────────────────────────────────────────────────────────┘
```

### Изменения

**1. src/lib/db.ts** — Расширить DiaryEntry

```typescript
export interface DiaryEntry {
  // ... existing
  title?: string;              // NEW: AI-generated or user-set
  titleSource?: 'ai' | 'user'; // NEW: who set the title
}

// Dexie Version 13 миграция
this.version(13).stores({
  entries: '++id, date, mood, *tags, *semanticTags, isPrivate, aiAllowed, createdAt, updatedAt, aiAnalyzedAt',
  // остальные без изменений
}).upgrade(tx => {
  return tx.table('entries').toCollection().modify(entry => {
    if (entry.title === undefined) {
      entry.title = null; // Пустой по умолчанию
      entry.titleSource = undefined;
    }
  });
});
```

**2. supabase/functions/ai-entry-analyze/index.ts** — Добавить titleSuggestion

```typescript
// Расширить промпт для full режима:
const systemPromptRu = `Ты — анализатор дневниковых записей в стиле "кибер-гримуара".

Анализируй текст и возвращай:
1. mood (1-5): эмоциональный тон
2. semanticTags (3-8): скрытые теги для поиска  
3. titleSuggestion: короткий заголовок (3-6 слов) в духе кибер-мистицизма
   - Используй термины: "контур", "сектор", "резонанс", "импульс", "сигнал"
   - Примеры: "Импульс в секторе Работа", "Контур семейного резонанса"
   - Если текст про рутину: "Дневной контур: [тема]"
   - Если эмоциональный: "Резонанс [эмоции]: [тема]"

JSON: {
  "mood": N,
  "confidence": 0.X,
  "semanticTags": [...],
  "titleSuggestion": "..."
}`;

// Расширить ответ:
interface AnalyzeResponse {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string;  // NEW
  requestId: string;
}
```

**3. src/lib/entryAnalysisService.ts** — Сохранять title

```typescript
// В analyzeEntryInBackground:
const updates: Partial<DiaryEntry> = {
  semanticTags: result.semanticTags,
  aiAnalyzedAt: Date.now(),
};

// Добавить title если есть
if (result.titleSuggestion && !entry.title) {
  updates.title = result.titleSuggestion;
  updates.titleSource = 'ai';
}
```

**4. src/components/EntryCard.tsx** — Показать title

```typescript
// Внутри content:
<div className="flex-1 min-w-0">
  {/* Title row (if exists) */}
  {entry.title && (
    <h4 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
      {entry.title}
      {entry.titleSource === 'ai' && (
        <span className="ml-1 text-xs text-cyber-glow/60">✨</span>
      )}
    </h4>
  )}
  
  {/* Time & date row */}
  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
    ...
  </div>
  
  {/* Text preview */}
  <p className="text-sm text-foreground/90 line-clamp-2">
    ...
  </p>
</div>
```

---

## Фаза 3: Weekly Insights AI

### Концепция

```text
┌────────────────────────────────────────────────────────────────────┐
│                    Weekly Insights (AI-Powered)                    │
│                                                                    │
│  Триггер: Кнопка "Обзор недели" в WeeklyInsightsWidget            │
│                                                                    │
│  Входные данные:                                                   │
│  - entries7d[].semanticTags → агрегировать частоты                 │
│  - entries7d[].mood → среднее + тренд                              │
│  - entries7d[].title → краткий контекст                            │
│                                                                    │
│  AI генерирует:                                                    │
│  {                                                                 │
│    "summary": "Неделя прошла под знаком работы...",               │
│    "dominantThemes": ["работа", "стресс", "семья"],               │
│    "moodPattern": "Позитивный тренд к концу недели",              │
│    "insight": "Замечен паттерн: продуктивные утра...",            │
│    "suggestion": "Рекомендация: больше отдыха в середине недели"  │
│  }                                                                 │
└────────────────────────────────────────────────────────────────────┘
```

### Изменения

**1. supabase/functions/ai-weekly-insights/index.ts** — Новый endpoint

```typescript
interface WeeklyRequest {
  entries: Array<{
    date: string;
    mood: number;
    semanticTags: string[];
    title?: string;
  }>;
  language: 'ru' | 'en';
}

interface WeeklyResponse {
  summary: string;        // 2-3 предложения
  dominantThemes: string[]; // Топ-5 тем
  moodPattern: string;    // Описание паттерна
  insight: string;        // Наблюдение
  suggestion: string;     // Рекомендация
  requestId: string;
}

const systemPrompt = `Ты — аналитик личного дневника в стиле "кибер-гримуара".
Проанализируй недельные данные и выяви паттерны.

Стиль ответа:
- Используй метафоры "контуров", "резонансов", "сигналов"
- Будь конкретен, но не цитируй записи
- Фокус на паттернах и инсайтах

JSON: {
  "summary": "...",
  "dominantThemes": [...],
  "moodPattern": "...",
  "insight": "...",
  "suggestion": "..."
}`;
```

**2. src/lib/db.ts** — Добавить WeeklyInsight storage

```typescript
export interface WeeklyInsight {
  weekStart: string;       // YYYY-MM-DD (понедельник)
  generatedAt: number;
  summary: string;
  dominantThemes: string[];
  moodPattern: string;
  insight: string;
  suggestion: string;
  sourceEntryCount: number;
}

// Dexie Version 13 добавить таблицу:
weeklyInsights: 'weekStart, generatedAt',
```

**3. src/components/WeeklyInsightsWidget.tsx** — Добавить AI кнопку

```typescript
// Добавить состояния:
const [showInsight, setShowInsight] = useState(false);
const [insight, setInsight] = useState<WeeklyInsight | null>(null);
const [isGenerating, setIsGenerating] = useState(false);

// Новый UI элемент:
{stats.entries7d >= 3 && (
  <Button
    variant="ghost"
    size="sm"
    onClick={handleGenerateInsight}
    disabled={isGenerating}
    className="mt-3 w-full text-xs text-cyber-glow hover:bg-cyber-glow/10"
  >
    {isGenerating ? (
      <Loader2 className="h-3 w-3 animate-spin mr-1" />
    ) : (
      <Sparkles className="h-3 w-3 mr-1" />
    )}
    {language === 'ru' ? 'Обзор недели' : 'Week Summary'}
  </Button>
)}

// Dialog/Sheet с результатом:
<Sheet open={showInsight} onOpenChange={setShowInsight}>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>✨ Резонанс недели</SheetTitle>
    </SheetHeader>
    <div className="space-y-4 mt-4">
      <p className="text-sm">{insight?.summary}</p>
      <div>
        <h4 className="text-xs text-muted-foreground">Доминирующие контуры:</h4>
        <div className="flex flex-wrap gap-1 mt-1">
          {insight?.dominantThemes.map(t => <TagBadge key={t} tag={t} />)}
        </div>
      </div>
      <div>
        <h4 className="text-xs text-muted-foreground">Паттерн настроения:</h4>
        <p className="text-sm">{insight?.moodPattern}</p>
      </div>
      <div className="p-3 bg-cyber-glow/5 rounded-lg border border-cyber-glow/20">
        <h4 className="text-xs text-cyber-glow mb-1">💡 Инсайт:</h4>
        <p className="text-sm">{insight?.insight}</p>
      </div>
      <div className="p-3 bg-primary/5 rounded-lg">
        <h4 className="text-xs text-primary mb-1">🎯 Рекомендация:</h4>
        <p className="text-sm">{insight?.suggestion}</p>
      </div>
    </div>
  </SheetContent>
</Sheet>
```

---

## Техническая спецификация

### Новые файлы

| Файл | Описание |
|------|----------|
| `supabase/functions/ai-weekly-insights/index.ts` | Edge Function для недельного анализа |

### Изменяемые файлы

| Файл | Изменения |
|------|-----------|
| `supabase/functions/ai-entry-analyze/index.ts` | + mode param, + titleSuggestion, + quick prompt |
| `src/lib/db.ts` | + title/titleSource в DiaryEntry, + WeeklyInsight, версия 13 |
| `src/lib/entryAnalysisService.ts` | + сохранение title |
| `src/hooks/usePredictiveMood.ts` | + AI вызов, + aiSuggestedMood state |
| `src/lib/sentimentService.ts` | + порог 0.5, + getInstantMoodHint() |
| `src/components/MoodSelector.tsx` | + индикаторы источника AI/local |
| `src/components/EntryCard.tsx` | + отображение title |
| `src/components/WeeklyInsightsWidget.tsx` | + кнопка "Обзор недели", + Sheet с результатом |
| `src/lib/aiConfig.ts` | + autoMoodAI настройки |
| `supabase/config.toml` | + ai-weekly-insights function |

---

## Оценка ресурсов

| Функция | Токенов/запрос | Запросов/день | Стоимость/месяц |
|---------|----------------|---------------|-----------------|
| Mood Quick | ~50 | ~10 | ~$0.005 |
| Entry Analyze (full) | ~300 | ~3 | ~$0.003 |
| Weekly Insights | ~500 | ~0.14 (раз в неделю) | ~$0.0007 |
| **ИТОГО** | — | — | **~$0.009/юзер** |

### Метрики успеха (до/после)

| Метрика | Текущее | Цель (Phase 1) | Цель (Phase 3) |
|---------|---------|----------------|----------------|
| Точность mood | ~60% | >85% | >85% |
| Retention suggestions | ~20% | >50% | >60% |
| Weekly engagement | N/A | N/A | +15% |
| API latency | N/A | <500ms (quick) | <1s (weekly) |

---

## Порядок реализации

```text
Week 1: Mood Predictor v2
├── Day 1: Расширить ai-entry-analyze (quick mode)
├── Day 2: Обновить usePredictiveMood (AI integration)
├── Day 3: UI индикаторы в MoodSelector
└── Day 4: Тестирование, fallback логика

Week 2: Smart Entry Titles  
├── Day 1: Расширить ai-entry-analyze (titleSuggestion)
├── Day 2: DB миграция, entryAnalysisService
├── Day 3: UI в EntryCard
└── Day 4: Тестирование

Week 3: Weekly Insights AI
├── Day 1: Новый Edge Function ai-weekly-insights
├── Day 2: DB таблица WeeklyInsight
├── Day 3: UI в WeeklyInsightsWidget
└── Day 4: Тестирование, кеширование
```

---

## Edge Cases

| Сценарий | Поведение |
|----------|-----------|
| Offline | Fallback на локальный keyword-анализ |
| Rate limit (429) | Показать локальный, retry через 30s |
| AI token истёк | Только локальный анализ + уведомление |
| Очень короткий текст (<30 chars) | Только локальный, без AI |
| Private entry | Пропустить AI полностью |
| Quick mode fail | Не блокирует save, retry в background |
| <3 записей за неделю | Скрыть кнопку "Обзор недели" |
