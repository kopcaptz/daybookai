

# ТЗ: RTL-поддержка (иврит/арабский) — v1.1 Final

## Исправления v1.1

| # | Было | Стало |
|---|------|-------|
| 1 | LogOut с rotate-180 | ChevronLeft/ArrowLeft с rotate-180 |
| 2 | "rtl: работает" без fallback | Fallback на isRTL() если rtl: не применяется |
| 3 | Мигрировать все left/right | Не трогать симметричные (inset-x-0, mx-auto) |

---

## Правила миграции (обновлённые)

### Что мигрируем

| Было | Станет | Когда |
|------|--------|-------|
| `ml-*` | `ms-*` | Всегда |
| `mr-*` | `me-*` | Всегда |
| `pl-*` | `ps-*` | Всегда |
| `pr-*` | `pe-*` | Всегда |
| `text-left` | `text-start` | Всегда |
| `text-right` | `text-end` | Всегда |
| `left-*` | `start-*` | Только если НЕ симметрично |
| `right-*` | `end-*` | Только если НЕ симметрично |
| `rounded-l-*` | `rounded-s-*` | Только если НЕ симметрично |
| `rounded-r-*` | `rounded-e-*` | Только если НЕ симметрично |
| `border-l-*` | `border-s-*` | Только если НЕ симметрично |
| `border-r-*` | `border-e-*` | Только если НЕ симметрично |

### Что НЕ мигрируем (симметричные паттерны)

```tsx
// НЕ ТРОГАЕМ — симметрично
inset-x-0
left-0 right-0
mx-auto
px-4  // (это не pl/pr)
rounded-lg  // (это не rounded-l/r)
```

### Directional иконки (исправлено)

```tsx
// ЗЕРКАЛИМ в RTL
<ChevronLeft className={cn("h-4 w-4", isRTL(language) && "rotate-180")} />
<ChevronRight className={cn("h-4 w-4", isRTL(language) && "rotate-180")} />
<ArrowLeft className={cn("h-4 w-4", isRTL(language) && "rotate-180")} />
<ArrowRight className={cn("h-4 w-4", isRTL(language) && "rotate-180")} />

// НЕ ЗЕРКАЛИМ — не directional
<LogOut />      // выход
<Settings />    // настройки
<Calendar />    // календарь
<Search />      // поиск
<Plus />        // добавить
<X />           // закрыть
<Users />       // пользователи
```

### Градиенты — стратегия с fallback

```tsx
// Вариант 1: Tailwind rtl: модификатор (если работает)
className="bg-gradient-to-r rtl:bg-gradient-to-l"

// Вариант 2: Fallback через isRTL (если rtl: не применяется)
className={cn(
  "bg-gradient-to-r",
  isRTL(language) && "bg-gradient-to-l"
)}
```

**Правило:** Сначала пробуем `rtl:`, если в runtime не работает — переключаемся на `isRTL()`.

---

## Этап 1 — RTL-инфраструктура

**Файлы:** `src/lib/i18n.tsx`

### 1.1 Расширение типов и helpers

```typescript
export type Language = 'ru' | 'en' | 'he' | 'ar';

export const RTL_LANGUAGES = ['he', 'ar'] as const;

export const isRTL = (lang: Language): boolean => 
  RTL_LANGUAGES.includes(lang as 'he' | 'ar');
```

### 1.2 Автоматическое dir-переключение

В `I18nProvider` добавить useEffect:

```typescript
useEffect(() => {
  document.documentElement.lang = language;
  document.documentElement.dir = isRTL(language) ? 'rtl' : 'ltr';
}, [language]);
```

### 1.3 Пустые переводы (placeholder)

```typescript
// Временно — чтобы не было ошибок
he: '...',  // будет заполнено позже
ar: '...',  // будет заполнено позже
```

---

## Этап 2 — Settings UI

**Файл:** `src/pages/SettingsPage.tsx`

Добавить языки в селектор:

```typescript
{ value: 'he', label: 'עברית' },
{ value: 'ar', label: 'العربية' }
```

**Тест:** Переключение на иврит → весь UI отзеркаливается.

---

## Этап 3 — Ядро навигации

### 3.1 BottomNav (`src/components/BottomNav.tsx`)

Замены:
- `ml-*` → `ms-*`
- `mr-*` → `me-*`
- `left-*` → `start-*` (только асимметричные)
- `right-*` → `end-*` (только асимметричные)

### 3.2 EtherealBottomTabs (`src/components/ethereal/EtherealBottomTabs.tsx`)

Аналогичные замены.

### 3.3 EtherealHeader (`src/components/ethereal/EtherealHeader.tsx`)

- Замены spacing классов
- **НЕ** зеркалим LogOut (это не "назад")
- Если есть ChevronLeft для "назад" — зеркалим

**Тест:** Навигация выглядит корректно в RTL.

---

## Этап 4 — UI Kit

**Файлы:** button, card, dialog, sheet, input, textarea, select, badge, alert

Применяем правила миграции:
- Spacing: `ml/mr/pl/pr` → `ms/me/ps/pe`
- Text: `text-left/right` → `text-start/end`
- Position: только асимметричные `left/right` → `start/end`
- Borders/Rounded: только асимметричные

**Тест:** Компоненты работают в обоих направлениях.

---

## Этап 5-8 — Страницы батчами

| Батч | Страницы |
|------|----------|
| 5 | Today, Calendar |
| 6 | Settings, Search |
| 7 | Chat, Discussions |
| 8 | Ethereal (все страницы) |

Применяем те же правила + зеркалим directional иконки.

---

## Этап 9 — Особые случаи

### 9.1 Числа и валюта

```tsx
<span dir="ltr" className="inline-block">₪ 125.00</span>
<span dir="ltr" className="inline-block">15:30</span>
```

### 9.2 Градиенты

Проверяем работу `rtl:` модификатора, если нет — используем isRTL().

### 9.3 Анимации

Проверяем sheet/drawer анимации, при необходимости корректируем направление.

---

## Этап 10-11 — Переводы

После стабильного RTL:
- Пакет 10: Hebrew (5 пакетов по ~30 ключей)
- Пакет 11: Arabic (5 пакетов по ~30 ключей)

---

## План выполнения

| Шаг | Описание | Файлы | Тест |
|-----|----------|-------|------|
| **1** | RTL infrastructure + types | `i18n.tsx` | ✓ |
| **2** | Settings UI | `SettingsPage.tsx` | ✓ |
| **3** | BottomNav + EtherealTabs + Header | 3 файла | ✓ |
| **4** | UI kit batch | ~10 файлов | ✓ |
| **5** | Today + Calendar | 2 файла | ✓ |
| **6** | Settings + Search | 2 файла | ✓ |
| **7** | Chat + Discussions | ~5 файлов | ✓ |
| **8** | Ethereal module | ~10 файлов | ✓ |
| **9** | Special cases | various | ✓ |
| **10** | Hebrew translations | `i18n.tsx` | ✓ |
| **11** | Arabic translations | `i18n.tsx` | ✓ |
| **12** | Polish + edge cases | various | ✓ |

---

## Чек-лист безопасности

- [ ] Не мигрируем симметричные паттерны (inset-x-0, mx-auto)
- [ ] Зеркалим только directional иконки (Chevron, Arrow)
- [ ] НЕ зеркалим UI иконки (Settings, LogOut, Users)
- [ ] Числа/даты обёрнуты в `dir="ltr"`
- [ ] Fallback на isRTL() если rtl: не работает
- [ ] Тест после каждого шага

---

**Готов начать с Шага 1 (RTL infrastructure)?**

