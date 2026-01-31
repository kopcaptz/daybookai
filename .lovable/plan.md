

# План: Удаление иконки из header Today.tsx

## Проблема

Иконка `GrimoireIcon` в шапке страницы Today накладывается на глобальную кнопку "Связь с Мастером" (`FeedbackModal`), которая фиксирована в позиции `top-4 left-4`.

## Решение

Удалить иконку `GrimoireIcon` из header страницы Today.tsx, оставив только центрированный текст заголовка.

---

## Изменение

**Файл:** `src/pages/Today.tsx`

**Текущая структура header (строки 145-165):**
```tsx
<div className="flex items-center justify-between">
  <div className="relative shrink-0 w-10">
    <GrimoireIcon className="h-8 w-8 text-cyber-sigil" />
    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-glow animate-sigil-pulse" />
  </div>
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-10 flex justify-end">
    {/* кнопка выбора */}
  </div>
</div>
```

**Новая структура:**
```tsx
<div className="flex items-center justify-between">
  <div className="shrink-0 w-10" /> {/* пустой placeholder для симметрии */}
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-10 flex justify-end">
    {/* кнопка выбора */}
  </div>
</div>
```

---

## Результат

```
┌─────────────────────────────────────────────────────┐
│ [Связь]     КИБЕР-ГРИМУАР           [Выбрать]      │
│             ЛИЧНЫЙ ДНЕВНИК                          │
└─────────────────────────────────────────────────────┘
```

- Кнопка "Связь с Мастером" остаётся в левом верхнем углу без конфликтов
- Заголовок остаётся центрированным
- Левый placeholder сохраняет симметрию верстки

---

## Файл для изменения

| Файл | Строки | Изменение |
|------|--------|-----------|
| `src/pages/Today.tsx` | 146-149 | Заменить `GrimoireIcon` на пустой `<div>` |

