
# План: Убрать дублирование иконки на Settings

## Проблема

На странице `/settings` отображаются две иконки гримуара в левом верхнем углу:
1. **FeedbackModal** — глобальная кнопка обратной связи (`fixed top-4 start-4`)
2. **GrimoireIcon в header** — бренд-иконка страницы настроек

Это создаёт визуальное дублирование и конфликт UI.

---

## Решение

Добавить `/settings` в список страниц, где FeedbackModal скрывается.

---

## Изменение

### Файл: `src/App.tsx`

**Строки 134-139** — Добавить `/settings` в условие `hideFeedback`:

```tsx
// Было:
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/') ||
  location.pathname.startsWith('/discussions/') ||
  location.pathname.startsWith('/e/');

// Стало:
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/') ||
  location.pathname.startsWith('/discussions/') ||
  location.pathname.startsWith('/e/') ||
  location.pathname === '/settings';  // ← Добавлено
```

---

## Результат

На странице настроек останется только бренд-иконка гримуара в header, без дублирующейся кнопки обратной связи.
