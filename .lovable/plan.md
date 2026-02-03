
# План: Исправить дублирование иконки на Settings

## Проблема

На странице `/settings` две иконки гримуара:
1. **GrimoireIcon в header** (строки 180-182) — бренд-декорация, не функциональная
2. **FeedbackModal** — рабочая кнопка обратной связи

Я ошибочно убрал FeedbackModal, а нужно было убрать декоративную иконку из header.

---

## Решение

### Изменение 1: `src/pages/SettingsPage.tsx`

**Строки 179-192** — Убрать GrimoireIcon из header, оставив симметричный layout:

```tsx
// Было:
<div className="flex items-center justify-between rtl:flex-row-reverse">
  <div className="relative shrink-0 w-8">
    <GrimoireIcon className="h-6 w-6 text-cyber-sigil" />
  </div>
  <div className="flex-1 text-center">
    ...
  </div>
  <div className="shrink-0 w-8" />
</div>

// Стало:
<div className="flex items-center justify-center">
  <div className="text-center">
    <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
      {t('app.name')}
    </h1>
    <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
      {t('app.subtitle')}
    </p>
  </div>
</div>
```

Также можно удалить неиспользуемый импорт `GrimoireIcon` если он больше нигде не нужен на этой странице.

---

### Изменение 2: `src/App.tsx`

**Строка 139** — Убрать `/settings` из `hideFeedback`, чтобы вернуть кнопку обратной связи:

```tsx
// Было:
const hideFeedback = ... ||
  location.pathname === '/settings';

// Стало (убрать эту строку):
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/') ||
  location.pathname.startsWith('/discussions/') ||
  location.pathname.startsWith('/e/');
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/SettingsPage.tsx` | Убрать GrimoireIcon из header |
| `src/App.tsx` | Убрать `/settings` из `hideFeedback` |

---

## Результат

- **FeedbackModal** остаётся в левом верхнем углу и работает
- **Header Settings** — чистый, без дублирующей иконки
- Центрированный заголовок без лишних элементов
