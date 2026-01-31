
# ТЗ: Центрирование заголовков на всех страницах

## Обзор

Центрировать заглавные надписи ("Кибер-Гримуар", "Обсуждения", "Чеки" и т.д.) на всех основных страницах приложения, сохраняя функциональные элементы (кнопки, иконки) по краям.

---

## Анализ текущего состояния

| Страница | Заголовок | Проблема |
|----------|-----------|----------|
| Today | "Кибер-Гримуар" | Прилеплен к левому краю |
| Calendar | "Кибер-Гримуар" | Прилеплен к левому краю |
| Settings | "Кибер-Гримуар" | Прилеплен к левому краю |
| Discussions | "Обсуждения" | Прилеплен к левому краю |
| Search | "Кибер-Гримуар" | Прилеплен к левому краю |
| Receipts | "Чеки" | Прилеплен к левому краю |

**Примечание:** Страницы DayView и DiscussionChat имеют динамические заголовки (дата, название сессии), их структура отличается и центрирование может выглядеть неестественно с кнопкой "назад".

---

## Целевая структура header

```
┌─────────────────────────────────────────────────────┐
│  [Icon]          ЗАГОЛОВОК           [Кнопка]       │
│                  подзаголовок                       │
└─────────────────────────────────────────────────────┘
```

Реализация через Flexbox:
- Левый блок (иконка): `shrink-0`
- Центральный блок (текст): `flex-1 text-center`
- Правый блок (кнопки): `shrink-0` с той же шириной, что и левый (для симметрии)

---

## Изменения по файлам

### 1. Today.tsx (строки 145-159)

**Было:**
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <div className="relative">
      <GrimoireIcon ... />
    </div>
    <div>
      <h1>...</h1>
      <p>...</p>
    </div>
  </div>
  {/* кнопка "Выбрать" */}
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between">
  <div className="relative shrink-0 w-10">
    <GrimoireIcon ... />
  </div>
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-10 flex justify-end">
    {/* кнопка "Выбрать" или пустое место */}
  </div>
</div>
```

### 2. CalendarPage.tsx (строки 142-154)

**Было:**
```tsx
<div className="flex items-center gap-3 mb-4">
  <div className="relative">
    <Calendar ... />
  </div>
  <div>
    <h1>...</h1>
    <p>...</p>
  </div>
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between mb-4">
  <div className="relative shrink-0 w-8">
    <Calendar ... />
  </div>
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-8" />
</div>
```

### 3. SettingsPage.tsx (строки 177-189)

**Было:**
```tsx
<div className="flex items-center gap-3">
  <div className="relative">
    <GrimoireIcon ... />
  </div>
  <div>
    <h1>...</h1>
    <p>...</p>
  </div>
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between">
  <div className="relative shrink-0 w-8">
    <GrimoireIcon ... />
  </div>
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-8" />
</div>
```

### 4. DiscussionsListPage.tsx (строки 69-98)

**Было:**
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-4">
    <div className="relative">
      <MessageSquare ... />
    </div>
    <div>
      <h1>...</h1>
      <p>...</p>
    </div>
  </div>
  <Button>+ Новое</Button>
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between">
  <div className="relative shrink-0 w-10">
    <MessageSquare ... />
  </div>
  <div className="flex-1 text-center min-w-0">
    <h1 className="truncate">...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0">
    <Button>+ Новое</Button>
  </div>
</div>
```

### 5. SearchPage.tsx (строки 62-74)

**Было:**
```tsx
<div className="flex items-center gap-3 mb-3">
  <div className="relative">
    <SearchIcon ... />
  </div>
  <div>
    <h1>...</h1>
    <p>...</p>
  </div>
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between mb-3">
  <div className="relative shrink-0 w-8">
    <SearchIcon ... />
  </div>
  <div className="flex-1 text-center">
    <h1>...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-8" />
</div>
```

### 6. ReceiptsPage.tsx (строки 114-168)

**Было:**
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <Button variant="ghost">← </Button>
    <div>
      <h1>...</h1>
      <p>...</p>
    </div>
  </div>
  {/* actions */}
</div>
```

**Станет:**
```tsx
<div className="flex items-center justify-between">
  <Button variant="ghost" className="shrink-0">← </Button>
  <div className="flex-1 text-center min-w-0">
    <h1 className="truncate">...</h1>
    <p>...</p>
  </div>
  <div className="shrink-0 w-10 flex justify-end">
    {/* actions */}
  </div>
</div>
```

---

## Файлы для изменения

| Файл | Строки | Описание |
|------|--------|----------|
| `src/pages/Today.tsx` | 145-173 | Центрирование brand header |
| `src/pages/CalendarPage.tsx` | 142-154 | Центрирование brand header |
| `src/pages/SettingsPage.tsx` | 177-189 | Центрирование brand header |
| `src/pages/DiscussionsListPage.tsx` | 69-98 | Центрирование с сохранением кнопки |
| `src/pages/SearchPage.tsx` | 62-74 | Центрирование brand header |
| `src/pages/ReceiptsPage.tsx` | 114-168 | Центрирование с сохранением кнопок |

---

## Исключения

Следующие страницы **не изменяются**, так как их заголовки контекстуально привязаны к навигации (кнопка "назад" + динамический заголовок):

- **DayView.tsx** — заголовок = дата дня
- **DiscussionChatPage.tsx** — заголовок = название сессии

---

## Проверки после реализации

1. Открыть каждую страницу и убедиться, что заголовок центрирован
2. Проверить, что кнопки справа/слева не обрезаются
3. Проверить на мобильном устройстве (узкий экран)
4. Убедиться, что длинные заголовки обрезаются корректно (truncate)
