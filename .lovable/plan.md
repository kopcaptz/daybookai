
# RTL-миграция v2.1 — Исправленный план

## Ключевые исправления

| # | Было (v2.0) | Стало (v2.1) |
|---|-------------|--------------|
| 1 | "Mo справа, Su слева" | Порядок дней определяется `weekStartsOn`, не `dir="rtl"` |
| 2 | `dir="rtl"` на grid — и всё | + Тест: месяц с 1-м числом в середине недели |
| 3 | Rotate обе ChevronLeft и ChevronRight | Swap иконок: `PrevIcon = isRTL ? ChevronRight : ChevronLeft` |
| 4 | `rtl:flex-row-reverse` на Button | Button уже `inline-flex` — работает ✓ |

---

## Архитектурное решение: Календарь

### Текущая логика (CalendarPage.tsx:48-49)
```typescript
const startDayOfWeek = monthStart.getDay(); // 0=Sunday, 1=Monday...
const paddingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Monday-first logic
```

**Текущее поведение:**
- Неделя начинается с Monday (EU default)
- weekDays массив: `[Mon, Tue, Wed, Thu, Fri, Sat, Sun]`

**RTL-стратегия:**
- `dir="rtl"` на grid переворачивает ВИЗУАЛЬНЫЙ порядок колонок
- Логика offset и padding остаётся той же
- Monday визуально будет справа, Sunday слева

**Критические тесты после изменений:**
1. Месяц, где 1-е число — четверг (padding проверка)
2. Клики по датам попадают в правильный день
3. "Сегодня" и "выбранный" подсвечиваются корректно

---

## Шаг 1: Flex Layout Fixes

### 1.1 Headers с justify-between

**Файлы и строки:**

| Файл | Строка | Контекст |
|------|--------|----------|
| `Today.tsx` | 172 | Date + Reminder button |
| `CalendarPage.tsx` | 142 | Brand header |
| `CalendarPage.tsx` | 158 | Month navigation |
| `DiscussionsListPage.tsx` | 56 | Title + New button |
| `SettingsPage.tsx` | TBD | Section headers |

**Паттерн:**
```tsx
// Было
<div className="flex items-center justify-between">

// Станет
<div className="flex items-center justify-between rtl:flex-row-reverse">
```

### 1.2 Icon + Text в кнопках

Button уже имеет `inline-flex items-center` (button.tsx:8), поэтому `rtl:flex-row-reverse` будет работать.

**Паттерн:**
```tsx
// Было
<Button className="gap-1.5">
  <Plus className="h-4 w-4" />
  {t('text')}
</Button>

// Станет
<Button className="gap-1.5 rtl:flex-row-reverse">
  <Plus className="h-4 w-4" />
  {t('text')}
</Button>
```

---

## Шаг 2: Calendar RTL (Правильный подход)

### 2.1 Grid direction

**CalendarPage.tsx — строки 178, 188:**
```tsx
// Week headers — добавить dir
<div className="mb-2 grid grid-cols-7 gap-1 text-center" dir="rtl">

// Calendar grid — добавить dir
<div className="grid grid-cols-7 gap-1" dir="rtl">
```

**Важно:** Логика `paddingDays` остаётся без изменений — grid автоматически отзеркалит визуальный порядок.

### 2.2 Navigation icons (SWAP, не rotate)

**CalendarPage.tsx — строки 159, 165:**
```tsx
import { isRTL, useI18n } from '@/lib/i18n';

function CalendarContent() {
  const { language } = useI18n();
  
  // Icon swap для prev/next
  const PrevIcon = isRTL(language) ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL(language) ? ChevronLeft : ChevronRight;
  
  // ...
  
  <Button onClick={goToPreviousMonth}>
    <PrevIcon className="h-5 w-5" />
  </Button>
  
  <Button onClick={goToNextMonth}>
    <NextIcon className="h-5 w-5" />
  </Button>
}
```

**Почему swap лучше rotate:**
- При `rtl:flex-row-reverse` + rotate обе иконки = путаница
- Swap сохраняет семантику: "Prev" всегда идёт к предыдущему

---

## Шаг 3: Today.tsx RTL

### 3.1 Header layout (строка 172)
```tsx
// Было
<div className="mt-3 flex items-center justify-between">

// Станет
<div className="mt-3 flex items-center justify-between rtl:flex-row-reverse">
```

### 3.2 Reminder button (строка 183-191)
```tsx
// Было
<Button className="text-xs gap-1">
  <Plus className="h-3.5 w-3.5" />
  {language === 'ru' ? 'Напоминание' : 'Reminder'}
</Button>

// Станет
<Button className="text-xs gap-1 rtl:flex-row-reverse">
  <Plus className="h-3.5 w-3.5" />
  {language === 'ru' ? 'Напоминание' : 'Reminder'}
</Button>
```

### 3.3 Selection mode bar (строка 291)
```tsx
// Кнопки Cancel и Discuss уже в flex контейнере
// Добавить rtl:flex-row-reverse к контейнеру
<div className="flex items-center gap-2 ... rtl:flex-row-reverse">
```

---

## Шаг 4: DiscussionsListPage.tsx RTL

### 4.1 Header (строка 56-70)
```tsx
// Было
<div className="flex items-center justify-between">

// Станет
<div className="flex items-center justify-between rtl:flex-row-reverse">
```

### 4.2 New button (строка 72-82)
```tsx
// Станет
<Button className="gap-1.5 rtl:flex-row-reverse">
  <Plus className="h-4 w-4" />
  {t('discussions.new')}
</Button>
```

---

## Шаг 5: SettingsPage.tsx RTL

Нужно проверить файл, но ожидаемые изменения:
- Section headers: `rtl:flex-row-reverse`
- Language/Theme selectors: grid/flex direction

---

## Шаг 6: NewEntry.tsx — Back Arrow

### 6.1 Swap, не rotate
```tsx
const BackIcon = isRTL(language) ? ArrowRight : ArrowLeft;

<Button onClick={() => navigate(-1)}>
  <BackIcon className="h-5 w-5" />
</Button>
```

---

## Тестовый план (после каждого шага)

### Обязательные проверки

| Экран | Что проверить |
|-------|---------------|
| **Calendar** | 1) Дни идут RTL 2) Февраль 2026 (1-е = воскресенье) 3) Клик = правильная дата 4) "Сегодня" подсвечен |
| **Today** | 1) Дата слева, Reminder справа в RTL 2) Selection bar корректен |
| **Settings** | 1) Секции не "расползаются" 2) Language selector читаем |
| **Discussions** | 1) + кнопка справа от заголовка |
| **NewEntry** | 1) Стрелка "назад" указывает вправо (→) в RTL |

### Edge case для календаря
**Март 2026:** 1-е марта = воскресенье
- В Monday-first логике будет 6 padding cells
- После `dir="rtl"` padding должен быть справа, числа слева

---

## Ожидаемый результат (исправленный)

После выполнения шагов 1-6:

1. **Settings** — секции и переключатели не "расползаются", заголовки и действия стоят логично для RTL
2. **Calendar** — сетка читается справа-налево, клики и подсветка работают корректно, навигация prev/next интуитивна
3. **Today** — верхняя панель (дата/Reminder) выглядит естественно в RTL
4. **Discussions** — кнопка "+" и заголовок не выглядят перепутанными
5. **NewEntry** — кнопки "назад/сохранить" стоят логично; стрелка показывает реальное направление

---

## Что НЕ делаем на этом этапе

1. ❌ Массовая замена `ml/mr → ms/me` (отложено до после flex-fixes)
2. ❌ Переводы на иврит/арабский (отложено)
3. ❌ Изменение логики `weekStartsOn` (оставляем Monday-first)

---

## Порядок выполнения

| # | Файл | Изменения |
|---|------|-----------|
| 1 | `CalendarPage.tsx` | `dir="rtl"` на grids + icon swap |
| 2 | `Today.tsx` | `rtl:flex-row-reverse` на headers и кнопки |
| 3 | `DiscussionsListPage.tsx` | `rtl:flex-row-reverse` на header |
| 4 | `NewEntry.tsx` | Icon swap для Back arrow |
| 5 | `SettingsPage.tsx` | RTL layout fixes |

**Тест после каждого файла!**
