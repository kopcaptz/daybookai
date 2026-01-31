

# ТЗ: Скрыть кнопку "Письмо мастеру" на страницах редактора записей

## Проблема

Кнопка обратной связи (иконка гримуара) находится в позиции `fixed top-4 left-4` и **перекрывает кнопку "назад"** на страницах:
- `/new` — создание новой записи
- `/entry/:id` — редактирование существующей записи

```text
┌─────────────────────────────────────────────────┐
│ [📖]  ← Перекрывает!                            │
│ [◀]     / New Entry              [Save]         │
└─────────────────────────────────────────────────┘
```

## Решение

Добавить исключение для этих маршрутов в логику скрытия `FeedbackModal` в `App.tsx`.

### Текущая логика (строки 101-103):

```typescript
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding';
```

### Новая логика:

```typescript
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/');
```

## Технические изменения

### Файл: `src/App.tsx`

**Изменение строк 101-103:**

```typescript
// Hide feedback modal on admin pages, onboarding, and entry editor
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/');
```

## Итоговый список страниц без кнопки "Письмо мастеру"

| Маршрут | Причина скрытия |
|---------|-----------------|
| `/admin/*` | Административная зона |
| `/onboarding` | Первичная настройка |
| `/new` | Конфликт с кнопкой "назад" |
| `/entry/:id` | Конфликт с кнопкой "назад" |

## Результат

После изменения кнопка "назад" на странице создания/редактирования записи будет полностью доступна, без перекрытия иконкой гримуара.

```text
┌─────────────────────────────────────────────────┐
│ [◀]     / New Entry              [Save]         │
│     (кнопка гримуара скрыта)                    │
└─────────────────────────────────────────────────┘
```

