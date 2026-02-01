
# План исправления: Авто-определение настроения не работает

## Обнаруженные проблемы

### Проблема 1: Подсказка не показывается если результат = текущему значению
В `usePredictiveMood.ts` строка 111:
```typescript
if (result.mood !== currentMood) {
  setSuggestedMood(result.mood);
  // ...
}
```
**Последствие**: Если анализ текста даёт `mood = 3` (нейтральное), а слайдер по умолчанию тоже на `3`, подсказка НЕ появляется. Пользователь думает, что система не работает.

### Проблема 2: Слишком высокий порог confidence
`SUGGESTION_THRESHOLD = 0.3` — если текст не содержит явных эмоциональных маркеров, confidence будет низким и подсказка не появится.

Пример: "Сегодня вторник" → `confidence = 0.1` → нет подсказки.

### Проблема 3: User Override блокирует все подсказки
Когда пользователь кликает на любое настроение, вызывается `predictiveMood.setUserOverride()`, что устанавливает флаг и **отключает все дальнейшие подсказки** для этой записи, даже если пользователь продолжает печатать.

### Проблема 4: Нет визуальной обратной связи при "совпадении"
Если система определила настроение и оно совпало с текущим — пользователь не видит никакого подтверждения что система работает.

---

## Решение

### 1. Показывать подтверждение при совпадении
Добавить новое состояние `confirmedMatch` — когда анализ подтверждает текущее настроение:

```typescript
// В usePredictiveMood.ts
const [confirmedMood, setConfirmedMood] = useState<number | null>(null);

if (result.mood === currentMood) {
  // Mood matches - show confirmation instead of suggestion
  setConfirmedMood(result.mood);
  setSuggestedMood(null);
} else {
  // Different mood - show suggestion
  setSuggestedMood(result.mood);
  setConfirmedMood(null);
}
```

### 2. Добавить визуальное подтверждение в MoodSelector
Показывать галочку или подсветку когда настроение "подтверждено" анализом:

```tsx
// В MoodSelector.tsx
{isConfirmed && (
  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 flex items-center justify-center">
    <Check className="h-2 w-2 text-white" />
  </span>
)}
```

### 3. Не блокировать подсказки при первом клике
Изменить логику: `userOverride` должен устанавливаться только если пользователь **явно отклонил** подсказку (кликнул на другое настроение, когда была активная подсказка).

### 4. Понизить threshold до 0.2
Чтобы система была более отзывчивой:
```typescript
const SUGGESTION_THRESHOLD = 0.2;
```

### 5. Добавить индикатор "анализ работает"
Показывать маленькую иконку Brain с анимацией во время debounce, чтобы пользователь видел что система активна.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/hooks/usePredictiveMood.ts` | Добавить `confirmedMood`, изменить логику override, понизить threshold |
| `src/components/MoodSelector.tsx` | Добавить визуальное подтверждение, показать индикатор активности |
| `src/pages/NewEntry.tsx` | Передать новые props в MoodSelector |

---

## Детальные изменения

### usePredictiveMood.ts

```typescript
// Добавить в интерфейс
export interface PredictiveMoodResult {
  suggestedMood: number | null;
  confirmedMood: number | null;  // NEW: когда анализ подтвердил текущее
  isAnalyzing: boolean;          // NEW: показать что идёт анализ
  // ... остальные поля
}

// Понизить threshold
const SUGGESTION_THRESHOLD = 0.2;

// В эффекте анализа
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [confirmedMood, setConfirmedMood] = useState<number | null>(null);

debounceRef.current = setTimeout(() => {
  setIsAnalyzing(true);
  const result = analyzeSentimentLocal(text);
  setIsAnalyzing(false);
  
  if (result.confidence >= SUGGESTION_THRESHOLD) {
    if (result.mood === currentMood) {
      // Подтверждаем текущее настроение
      setConfirmedMood(result.mood);
      setSuggestedMood(null);
      trackUsageEvent('autoMoodSuggestions'); // Считаем как suggestion
    } else {
      // Предлагаем другое настроение
      setSuggestedMood(result.mood);
      setConfirmedMood(null);
      trackUsageEvent('autoMoodSuggestions');
    }
  }
}, debounceMs);

// Изменить логику userOverride
// Сбрасывать только если пользователь явно выбрал ДРУГОЕ настроение
// когда была активная подсказка
const setUserOverride = useCallback(() => {
  // Только если была подсказка и пользователь выбрал другое
  if (suggestedMood !== null) {
    setUserOverrideState(true);
  }
  setSuggestedMood(null);
  setConfirmedMood(null);
}, [suggestedMood]);
```

### MoodSelector.tsx

```typescript
interface MoodSelectorProps {
  value: number;
  onChange: (value: number) => void;
  suggestedMood?: number | null;
  confirmedMood?: number | null;  // NEW
  isAnalyzing?: boolean;          // NEW
  suggestionSource?: 'text' | 'discussion' | 'entry' | null;
  onSuggestionAccept?: () => void;
}

// В JSX
{isSelected && confirmedMood === mood && (
  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500/80 flex items-center justify-center">
    <Check className="h-2 w-2 text-white" />
  </span>
)}

// Индикатор анализа в заголовке
{isAnalyzing && (
  <Brain className="h-3 w-3 text-cyber-sigil animate-pulse" />
)}
```

### NewEntry.tsx

```typescript
<MoodSelector 
  value={mood} 
  onChange={handleMoodChange}
  suggestedMood={predictiveMood.suggestedMood}
  confirmedMood={predictiveMood.confirmedMood}
  isAnalyzing={predictiveMood.isAnalyzing}
  suggestionSource={predictiveMood.source}
  onSuggestionAccept={() => {
    if (predictiveMood.suggestedMood) {
      setMood(predictiveMood.suggestedMood);
      trackUsageEvent('autoMoodAccepted');
    }
  }}
/>
```

---

## Тестирование

После изменений проверить:

1. **Нейтральный текст**: "Сегодня вторник" → должна появиться галочка на позиции 3
2. **Позитивный текст**: "Отличный день! 🎉" → должна появиться подсказка на 5
3. **Смена текста**: После принятия подсказки, продолжить печатать → подсказки должны продолжать появляться
4. **Индикатор анализа**: При печати видна пульсирующая иконка Brain

---

## Технические детали

- Изменения затрагивают 3 файла
- Никаких изменений в Edge Functions или базе данных
- Обратная совместимость сохранена (новые props опциональны)
- Время на реализацию: ~30 минут
