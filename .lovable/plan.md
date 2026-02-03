

# План: RTL-фикс для названия "Magic Notebook" + аудит мест использования

## Проблема

1. **Bidi-проблема**: При установке `app.name` = "Magic Notebook" для всех языков, в RTL-режиме (иврит/арабский) латинское название может "прыгать" или отображаться некорректно из-за смешивания направлений текста.

2. **Переполнение**: "Magic Notebook" длиннее чем "מחברת קסומה" (иврит) и "دفتر سحري" (арабский), что может вызвать переполнение в узких контейнерах.

---

## Места использования `app.name`

| Файл | Строка | Контекст | Риск |
|------|--------|----------|------|
| `src/lib/i18n.tsx` | 17 | Определение ключа | - |
| `src/pages/Today.tsx` | 148 | Header h1 (с `truncate`) | ✅ Защищён `truncate` |
| `src/pages/CalendarPage.tsx` | 149 | Header h1 | Нужен `dir="ltr"` |
| `src/pages/SearchPage.tsx` | 68 | Header h1 | Нужен `dir="ltr"` |
| `src/pages/ChatPage.tsx` | 390, 439, 485 | Header h1 (3 места) | Нужен `dir="ltr"` |
| `src/pages/SettingsPage.tsx` | 182 | Header h1 | Нужен `dir="ltr"` |
| `src/pages/SettingsPage.tsx` | 492 | App Info карточка | Нужен `dir="ltr"` |
| `index.html` | 23, 27, 29, 37 | PWA meta, SEO, title | Статично на русском — не затрагивает |
| `src/pages/OnboardingPage.tsx` | 21, 39, 57, 75 | Slide body text | Текст в контексте, dir от контейнера |

---

## Изменения

### 1. `src/lib/i18n.tsx` — строка 17

**Изменить название на единое "Magic Notebook":**

```tsx
// Было:
'app.name': { ru: 'Магический блокнот', en: 'Magic Notebook', he: 'מחברת קסומה', ar: 'دفتر سحري' },

// Станет:
'app.name': { ru: 'Magic Notebook', en: 'Magic Notebook', he: 'Magic Notebook', ar: 'Magic Notebook' },
```

---

### 2. `src/pages/Today.tsx` — строка 148

**Добавить `dir="ltr"` и сохранить `truncate`:**

```tsx
// Было:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide truncate">
  {t('app.name')}
</h1>

// Станет:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide truncate" dir="ltr">
  {t('app.name')}
</h1>
```

---

### 3. `src/pages/CalendarPage.tsx` — строка 149

```tsx
// Было:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
  {t('app.name')}
</h1>

// Станет:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide" dir="ltr">
  {t('app.name')}
</h1>
```

---

### 4. `src/pages/SearchPage.tsx` — строка 68

```tsx
// Было:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
  {t('app.name')}
</h1>

// Станет:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide" dir="ltr">
  {t('app.name')}
</h1>
```

---

### 5. `src/pages/ChatPage.tsx` — строки 389-390, 438-439, 484-485

**Три места с одинаковой структурой:**

```tsx
// Было:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
  {t('app.name')}
</h1>

// Станет:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide" dir="ltr">
  {t('app.name')}
</h1>
```

---

### 6. `src/pages/SettingsPage.tsx` — строка 182

```tsx
// Было:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
  {t('app.name')}
</h1>

// Станет:
<h1 className="text-xl font-serif font-medium text-foreground tracking-wide" dir="ltr">
  {t('app.name')}
</h1>
```

---

### 7. `src/pages/SettingsPage.tsx` — строки 490-492

**Карточка App Info — обернуть в span с dir="ltr":**

```tsx
// Было:
<div className="flex items-center gap-2">
  <GrimoireIcon className="h-5 w-5 text-cyber-sigil" />
  {t('app.name')}
</div>

// Станет:
<div className="flex items-center gap-2">
  <GrimoireIcon className="h-5 w-5 text-cyber-sigil" />
  <span dir="ltr">{t('app.name')}</span>
</div>
```

---

### 8. Onboarding — НЕ ТРОГАЕМ

В `OnboardingPage.tsx` название используется внутри body текста слайдов:
- "Magic Notebook — дневник..." (ru)
- "Magic Notebook is a journal..." (en)
- "Magic Notebook הוא יומן..." (he)
- "دفتر الملاحظات السحري هو يوميات..." (ar)

Здесь название является частью предложения, и браузер корректно обрабатывает bidi-переходы внутри текста. Добавлять `dir` не нужно.

---

## Сводка изменений

| Файл | Строка | Изменение |
|------|--------|-----------|
| `src/lib/i18n.tsx` | 17 | Единое название "Magic Notebook" |
| `src/pages/Today.tsx` | 147-148 | `dir="ltr"` на h1 |
| `src/pages/CalendarPage.tsx` | 148-149 | `dir="ltr"` на h1 |
| `src/pages/SearchPage.tsx` | 67-68 | `dir="ltr"` на h1 |
| `src/pages/ChatPage.tsx` | 389, 438, 484 | `dir="ltr"` на h1 (3 места) |
| `src/pages/SettingsPage.tsx` | 181 | `dir="ltr"` на h1 |
| `src/pages/SettingsPage.tsx` | 492 | `<span dir="ltr">` вокруг названия |

**Всего: 8 файлов, 9 точечных правок**

---

## Ожидаемый результат

- Название "Magic Notebook" отображается корректно во всех языках
- В RTL-режиме латинское название не "прыгает" и не переворачивается
- Подзаголовки остаются локализованными ("Записи • Медиа • Хроника дня" и т.д.)
- `truncate` на Today защищает от переполнения на узких экранах

