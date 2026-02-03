

# План: Исправить порядок элементов header в RTL на странице обсуждения

## Проблема

На скриншотах в режиме иврит и арабский видно:
- Кнопка "назад" (←) находится **справа** 
- Кнопка "Контекст" находится **слева**
- Заголовок в центре

Это неправильно! В RTL режиме:
- Кнопка "назад" должна быть **слева** (указывает наружу к краю экрана)
- Кнопка "Контекст" должна быть **справа** (действие)

## Анализ

Flexbox в RTL автоматически меняет порядок элементов (`flex-direction: row` становится визуально reversed). Чтобы сохранить **физическое** расположение элементов (back=left, action=right), нужно использовать `rtl:flex-row-reverse`.

## Решение

В файле `src/pages/DiscussionChatPage.tsx`, строка 214 — добавить `rtl:flex-row-reverse` к header flex-контейнеру:

```tsx
// До
<div className="flex items-center gap-3 px-4 py-3">

// После  
<div className="flex items-center gap-3 px-4 py-3 rtl:flex-row-reverse">
```

## Почему это работает

**LTR (English/Russian):**
- Flex order: `[Back] [Title] [Context]`
- Visual: `[←] Title [Context →]` ✓

**RTL (Hebrew/Arabic) без fix:**
- Flex order reversed by browser: `[Context] [Title] [Back]`
- Visual: `[Context] Title [→]` ✗ (неправильно)

**RTL с `rtl:flex-row-reverse`:**
- Flex order: reverse of reversed = original
- Visual: `[←] Title [Context]` ✓ (кнопка назад слева!)

---

## Файл для изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/DiscussionChatPage.tsx` | Добавить `rtl:flex-row-reverse` к header div (строка 214) |

---

## Визуальный результат

**LTR:**
```
┌─────────────────────────────────────┐
│ [←]  דיון חדש / entries 0  [הקשר]  │
└─────────────────────────────────────┘
```

**RTL (после исправления):**
```
┌─────────────────────────────────────┐
│ [←]  דיון חדש / entries 0  [הקשר]  │
└─────────────────────────────────────┘
```

Кнопка ← остаётся слева на экране, указывая "наружу" к краю.

