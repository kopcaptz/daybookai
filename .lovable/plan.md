
# Фаза 2: Smart Entry Titles

## Обзор

Автоматическая генерация заголовков для записей дневника в стиле "кибер-мистицизма". Заголовки генерируются через AI после сохранения записи и отображаются в карточках на главной странице.

## Текущее состояние

| Компонент | Статус |
|-----------|--------|
| Edge Function `ai-entry-analyze` | Уже возвращает `titleSuggestion` в full mode |
| `DiaryEntry` interface | Нет полей title/titleSource |
| `entryAnalysisService.ts` | Не сохраняет title |
| `EntryCard.tsx` | Не показывает title |

## Изменения

### 1. src/lib/db.ts — Расширить DiaryEntry + Version 13

**Добавить поля в интерфейс:**
```typescript
export interface DiaryEntry {
  // ... existing fields ...
  title?: string;              // AI-generated or user-set title
  titleSource?: 'ai' | 'user'; // Who created the title
}
```

**Добавить миграцию Version 13:**
```typescript
this.version(13).stores({
  entries: '++id, date, mood, *tags, *semanticTags, isPrivate, aiAllowed, createdAt, updatedAt, aiAnalyzedAt',
  // ... rest unchanged ...
}).upgrade(tx => {
  return tx.table('entries').toCollection().modify(entry => {
    if (entry.title === undefined) {
      entry.title = null;
      entry.titleSource = undefined;
    }
  });
});
```

### 2. src/lib/entryAnalysisService.ts — Сохранять title

**Расширить AnalysisResult interface:**
```typescript
interface AnalysisResult {
  mood: number;
  confidence: number;
  semanticTags: string[];
  titleSuggestion?: string;  // NEW
  requestId: string;
}
```

**Обновить analyzeEntryInBackground:**
```typescript
// После получения result...
const updates: Partial<DiaryEntry> = {
  semanticTags: result.semanticTags,
  aiAnalyzedAt: Date.now(),
};

// Добавить title если AI его сгенерировал и у записи нет title
if (result.titleSuggestion && !entry.title) {
  updates.title = result.titleSuggestion;
  updates.titleSource = 'ai';
}
```

**Обновить processQueueItem аналогично.**

### 3. src/components/EntryCard.tsx — Показать title

**Добавить отображение заголовка:**
```tsx
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
  <div className="flex items-center gap-2 ...">
    ...
  </div>
  
  {/* Text preview */}
  <p className="text-sm ...">
    ...
  </p>
</div>
```

## Визуальный результат

```text
┌─────────────────────────────────────────────────────────┐
│  😊  Импульс в секторе Работа ✨                        │
│      15:42 • 24 янв                                     │
│      Сегодня встретился с командой. Обсудили новый...   │
│      [Работа] [Встреча]                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  😐  Дневной контур: утренняя рутина ✨                  │
│      08:15 • 24 янв                                     │
│      Проснулся, позавтракал, почитал новости...         │
│      [Рутина]                                           │
└─────────────────────────────────────────────────────────┘
```

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/db.ts` | + title/titleSource в DiaryEntry, + Version 13 миграция |
| `src/lib/entryAnalysisService.ts` | + titleSuggestion в AnalysisResult, + сохранение title |
| `src/components/EntryCard.tsx` | + отображение title с индикатором ✨ |

## Edge Cases

| Сценарий | Поведение |
|----------|-----------|
| Запись уже имеет title | AI не перезаписывает |
| Пользователь задал title | titleSource = 'user', без ✨ |
| AI не сгенерировал title | Карточка показывает только время |
| Очень длинный title | `line-clamp-1` обрезает с ... |
| Старые записи после миграции | title = null, показывается как раньше |

## Оценка

| Метрика | Значение |
|---------|----------|
| Время реализации | ~20 минут |
| Новые зависимости | Нет |
| Влияние на UX | Высокое — улучшает визуальную иерархию |
| API cost | 0 — title уже генерируется в full mode |
