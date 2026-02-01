
# План: Секретный вход через кнопку "Связь с Мастером" (исправленная версия)

## Обзор изменений

Переносим секретный вход в Ethereal Layer с несуществующей иконки луны на существующую кнопку FeedbackModal (гримуар в левом верхнем углу).

**Жест:** Долгое нажатие 3 сек → свайп вниз 100px → Ethereal PIN

## Этапы реализации

### 1. Создать хук useSecretLongPressSwipe.ts

Новый файл: `src/hooks/useSecretLongPressSwipe.ts`

Исправления по сравнению с первоначальным планом:
- Остановка `progressInterval` при переходе в swiping (не ждём cleanup)
- Фиксация `startY` через `lastY` после hold (защита от микродвижений во время удержания)
- Единые фазы `idle | holding | swiping` в ref и React state
- Добавлен `onLostPointerCapture` для Android
- Типы таймеров: `ReturnType<typeof window.setTimeout>` вместо NodeJS.Timeout

### 2. Модифицировать FeedbackModal.tsx

Изменения:
- Удалить `DialogTrigger` (заменяем на ручное управление `setOpen`)
- Добавить `touch-none` класс на кнопку (предотвращает скролл страницы при свайпе)
- Интегрировать хук с callback'ами:
  - `onSecretUnlock` → вызывает проп
  - `onNormalClick` → `setOpen(true)`
- Добавить визуальный feedback:
  - SVG-кольцо прогресса вокруг иконки
  - Стрелка ↓ после завершения hold
  - `scale-110` при активном жесте

### 3. Обновить App.tsx

- Добавить state: `showEtherealPin`
- Импортировать `EtherealPinModal`
- Передать `onSecretUnlock={() => setShowEtherealPin(true)}` в FeedbackModal
- Рендерить `EtherealPinModal` глобально

### 4. Очистить Today.tsx

Удалить:
- Импорт `SecretMoon`
- Импорт `EtherealPinModal`
- State `showEtherealPin`
- JSX компоненты `<SecretMoon>` и `<EtherealPinModal>`

### 5. Удалить неиспользуемые файлы

- `src/components/SecretMoon.tsx`
- `src/hooks/useMoonLongPress.ts`

---

## Техническая реализация

### useSecretLongPressSwipe.ts (исправленная версия)

```typescript
import { useCallback, useMemo, useRef, useState } from "react";

type Phase = "idle" | "holding" | "swiping";

interface UseSecretLongPressSwipeOptions {
  onSecretUnlock: () => void;
  onNormalClick: () => void;
  holdDuration?: number;
  swipeDistance?: number;
}

interface GestureState {
  phase: Phase;
  startTime: number;
  startY: number;
  lastY: number;
  pointerId: number | null;
}
```

Ключевые особенности:
- `lastY` обновляется на каждом `onPointerMove`
- При переходе в swiping: `st.startY = st.lastY` (защита от накопленного смещения)
- `stopTimers()` вызывается ДО перехода в swiping
- `onLostPointerCapture` → cleanup (Android stability)

### FeedbackModal.tsx изменения

```typescript
interface FeedbackModalProps {
  onSecretUnlock?: () => void;
}

export function FeedbackModal({ onSecretUnlock }: FeedbackModalProps) {
  const { handlers, progress, phase } = useSecretLongPressSwipe({
    onSecretUnlock: () => onSecretUnlock?.(),
    onNormalClick: () => setOpen(true),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Убран DialogTrigger — ручное управление */}
      <button
        {...handlers}
        className={cn(
          "touch-none", // ← предотвращает скролл
          phase !== 'idle' && "scale-110"
        )}
      >
        {/* Progress ring + swipe hint */}
      </button>
      <DialogContent>...</DialogContent>
    </Dialog>
  );
}
```

### App.tsx интеграция

```typescript
const [showEtherealPin, setShowEtherealPin] = useState(false);

// В JSX:
{!hideFeedback && (
  <FeedbackModal onSecretUnlock={() => setShowEtherealPin(true)} />
)}

<EtherealPinModal 
  open={showEtherealPin} 
  onOpenChange={setShowEtherealPin} 
/>
```

---

## UX-логика (финальная)

| Действие | Результат |
|----------|-----------|
| Короткий клик | Открыть feedback диалог |
| Отпустили до 3 сек | Открыть feedback диалог |
| Держали >3 сек, отпустили без свайпа | Ничего (сброс) |
| Держали >3 сек + свайп вниз 100px | Ethereal PIN модал |

---

## Файлы

| Действие | Файл |
|----------|------|
| Создать | `src/hooks/useSecretLongPressSwipe.ts` |
| Изменить | `src/components/FeedbackModal.tsx` |
| Изменить | `src/App.tsx` |
| Изменить | `src/pages/Today.tsx` |
| Удалить | `src/components/SecretMoon.tsx` |
| Удалить | `src/hooks/useMoonLongPress.ts` |
