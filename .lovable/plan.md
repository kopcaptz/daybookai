
# План: RTL Polish & Hebrew i18n (v2.3)

## Приоритет задач

| # | Задача | Статус |
|---|--------|--------|
| 1 | Проверить onboarding в Hebrew | Код готов (добавлены `he`/`ar` слайды) |
| 2 | Hebrew i18n — минимальный скелет | Нужно добавить ~60 ключей |
| 3 | Spacing migration (точечно) | `BottomNav` + `EntryCard` |

---

## Шаг 1: Проверка Onboarding (Manual Test)

**Onboarding уже должен работать!** Мы добавили:
- `slides.he` и `slides.ar` с 4 слайдами каждый
- `labels.he` и `labels.ar` для кнопок
- Fallback для theme labels через `getBaseLanguage()`

**Как проверить:**
1. В DevTools Console выполнить: `localStorage.removeItem('daybook-onboarded')`
2. Перезагрузить страницу
3. Язык должен быть עברית
4. Проверить:
   - [ ] Страница загружается без белого экрана
   - [ ] Текст на иврите отображается
   - [ ] Кнопки "דלג", "הבא", "חזרה", "התחל" работают
   - [ ] Свайпы работают (RTL направление)

---

## Шаг 2: Hebrew i18n — Минимальный скелет

Добавить Hebrew переводы для ключевых разделов в `src/lib/i18n.tsx`.

### 2.1 Navigation keys (критично для BottomNav)

```typescript
'nav.today': { ru: '...', en: '...', he: 'היום' },
'nav.calendar': { ru: '...', en: '...', he: 'לוח שנה' },
'nav.discussions': { ru: '...', en: '...', he: 'דיונים' },
'nav.settings': { ru: '...', en: '...', he: 'הגדרות' },
```

### 2.2 Common keys

```typescript
'common.save': { ..., he: 'שמור' },
'common.cancel': { ..., he: 'ביטול' },
'common.delete': { ..., he: 'מחק' },
'common.back': { ..., he: 'חזרה' },
```

### 2.3 Today page keys

```typescript
'today.noEntries': { ..., he: 'אין רשומות עדיין' },
'today.startDay': { ..., he: 'התחל את היום' },
'today.select': { ..., he: 'בחר' },
'today.cancel': { ..., he: 'ביטול' },
'today.discuss': { ..., he: 'דון' },
```

### 2.4 Calendar keys (weekdays + months)

```typescript
'calendar.mon': { ..., he: 'ב׳' },
'calendar.tue': { ..., he: 'ג׳' },
'calendar.wed': { ..., he: 'ד׳' },
'calendar.thu': { ..., he: 'ה׳' },
'calendar.fri': { ..., he: 'ו׳' },
'calendar.sat': { ..., he: 'ש׳' },
'calendar.sun': { ..., he: 'א׳' },

'calendar.january': { ..., he: 'ינואר' },
'calendar.february': { ..., he: 'פברואר' },
// ... и т.д.
```

### 2.5 Entry keys

```typescript
'entry.new': { ..., he: 'רשומה חדשה' },
'entry.empty': { ..., he: 'רשומה ריקה' },
'entry.saved': { ..., he: 'רשומה נשמרה' },
```

### 2.6 Settings keys

```typescript
'settings.title': { ..., he: 'הגדרות' },
'settings.theme': { ..., he: 'ערכת נושא' },
'settings.language': { ..., he: 'שפה' },
```

**Общее количество:** ~50-60 ключей для "ощущения продукта"

---

## Шаг 3: Spacing Migration (точечно)

### 3.1 BottomNav (`src/components/BottomNav.tsx`)

**Проблемные места:**

| Строка | Текущий | Исправленный |
|--------|---------|--------------|
| 75 | `left-1` | `start-1` (для Glow accent) |
| 109 | `-right-3` | `-end-3` (для Badge) |

```tsx
// Строка 75
<div className="absolute top-1 start-1 w-4 h-4 rounded-full bg-cyber-glow/20 blur-sm" />

// Строка 109
<Badge 
  className="absolute -top-2 -end-3 h-4 min-w-4 px-1 ..."
>
```

**Что НЕ меняем:**
- `left-0 right-0` — симметричные, работают в RTL
- `left-1/2 -translate-x-1/2` — центрирование, работает

### 3.2 EntryCard (`src/components/EntryCard.tsx`)

**Проблемные места:**

| Строка | Текущий | Исправленный |
|--------|---------|--------------|
| 67 | `ml-1` | `ms-1` (для AI sparkle) |
| 82 | `ml-auto` | `ms-auto` (для Lock icon) |

```tsx
// Строка 67
{entry.titleSource === 'ai' && (
  <span className="ms-1 text-xs text-cyber-glow/60">✨</span>
)}

// Строка 82
<Lock className="h-3 w-3 ms-auto text-cyber-rune/60" />
```

### 3.3 ChevronRight direction

В RTL ChevronRight должен указывать влево. Варианты:

**Опция A (простая):** Добавить `rtl:rotate-180`
```tsx
<ChevronRight className="... rtl:rotate-180" />
```

**Опция B (семантическая):** Swap на ChevronLeft
```tsx
import { isRTL, useI18n } from '@/lib/i18n';

const ArrowIcon = isRTL(language) ? ChevronLeft : ChevronRight;
```

Рекомендую **Опция A** для EntryCard, т.к. это декоративный индикатор.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/i18n.tsx` | Добавить `he:` переводы для ~50-60 ключей |
| `src/components/BottomNav.tsx` | `left-1` → `start-1`, `-right-3` → `-end-3` |
| `src/components/EntryCard.tsx` | `ml-1` → `ms-1`, `ml-auto` → `ms-auto`, ChevronRight RTL |

---

## Чек-лист после изменений

### Onboarding (уже должен работать)
- [ ] Страница загружается в Hebrew
- [ ] Свайпы работают в обе стороны
- [ ] Кнопки навигации работают

### BottomNav
- [ ] Badge напоминаний справа от иконки (в LTR) / слева (в RTL)
- [ ] Glow accent в правильном углу кнопки

### EntryCard
- [ ] Sparkle "✨" после заголовка (не перед)
- [ ] Lock иконка справа (в LTR) / слева (в RTL)
- [ ] Chevron указывает в направлении перехода

### i18n
- [ ] BottomNav показывает ивритские лейблы
- [ ] Calendar показывает ивритские дни недели
- [ ] Today page не имеет английских fallback-ов

---

## Что НЕ делаем в этом патче

- Массовый рефактор всех `ml/mr` → `ms/me`
- Arabic переводы (только Hebrew как первый RTL)
- Изменения в логике календаря (weekStartsOn)
