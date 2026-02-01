
# План: Исправление авто-настроения

## Диагноз проблемы

Авто-настроение **не работает**, потому что:

1. **Настройка `autoMood` выключена по умолчанию** в `src/lib/aiConfig.ts`:
   ```typescript
   autoMood: false, // OFF by default (opt-in)
   ```

2. Хук `usePredictiveMood` проверяет эту настройку и возвращает пустой результат (`suggestedMood: null`) если она выключена.

3. Пользователь должен вручную включить "Био-сенсор" в настройках AI, но это **не очевидно**.

## Решение

### Вариант A: Включить по умолчанию (рекомендуется)

Изменить значение по умолчанию с `false` на `true`:

**Файл:** `src/lib/aiConfig.ts`

```typescript
// Было:
autoMood: false, // OFF by default (opt-in)

// Станет:
autoMood: true, // ON by default
```

**Плюсы:** Фича сразу работает, пользователи видят её ценность
**Минусы:** Может быть неожиданным для существующих пользователей

### Вариант B: Показать подсказку при первом использовании

Добавить onboarding-tooltip в `NewEntry.tsx` который объясняет как включить авто-настроение.

### Вариант C: Включать вместе с AI-ассистентом

Когда пользователь включает AI (`enabled: true`), автоматически включать и `autoMood: true`.

## Рекомендация

**Вариант A** — самый простой и эффективный. Одна строка кода.

## Изменения

| Файл | Изменение |
|------|-----------|
| `src/lib/aiConfig.ts` | Строка 77: `autoMood: false` → `autoMood: true` |

## Примечание

Для **существующих пользователей** настройка уже сохранена в localStorage как `false`. Им всё равно придётся включить вручную или:
- Очистить localStorage
- Добавить миграцию настроек

## Техническая реализация

```typescript
// src/lib/aiConfig.ts, строка 77
export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  chatProfile: 'balanced',
  bioProfile: 'biography',
  strictPrivacy: true,
  autoMood: true,  // ← ИЗМЕНЕНИЕ: ON by default
  autoMoodLiveSuggestions: true,
  autoMoodInheritFromChat: true,
  autoTags: true,  // ← БОНУС: тоже включить?
  autoScreenshot: false,
  autoScreenshotBlurPrivate: true,
};
```
