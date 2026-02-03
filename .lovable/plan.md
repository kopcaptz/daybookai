
# План: i18n и RTL для Discussions Page

## Обнаруженные проблемы

На скриншоте видно несколько UI-проблем:

| # | Проблема | Файл | Строка |
|---|----------|------|--------|
| 1 | "CHAT WITH ENTRIES" на английском | DiscussionsListPage.tsx | 78 |
| 2 | Название новой сессии только ru/en | DiscussionsListPage.tsx | 46 |
| 3 | Описание удаления только ru/en | DiscussionsListPage.tsx | 152-154 |
| 4 | SealGlyph `right-3`, `left-3` | DiscussionsListPage.tsx | 110, 113 |
| 5 | DropdownMenu button `right-2` | SessionCard.tsx | 75 |
| 6 | DropdownMenuItem `mr-2` | SessionCard.tsx | 83, 90 |
| 7 | ChevronRight без RTL rotate | SessionCard.tsx | 66 |
| 8 | getScopeCountText типизация | contextPack.ts | 421 |
| 9 | date-fns locale только ru/en | SessionCard.tsx | 25 |

---

## Решение

### Файл 1: `src/lib/i18n.tsx`

Добавить недостающие ключи:

```typescript
// Discussions additions
'discussions.subtitle': { 
  ru: 'Чат с записями', 
  en: 'Chat with entries', 
  he: 'צ\'אט עם רשומות', 
  ar: 'دردشة مع المدخلات' 
},
'discussions.newTitle': { 
  ru: 'Новое обсуждение', 
  en: 'New discussion', 
  he: 'דיון חדש', 
  ar: 'مناقشة جديدة' 
},
'discussions.deleteDesc': { 
  ru: 'Это действие нельзя отменить. Все сообщения будут удалены.', 
  en: 'This action cannot be undone. All messages will be deleted.', 
  he: 'לא ניתן לבטל פעולה זו. כל ההודעות יימחקו.', 
  ar: 'لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع الرسائل.' 
},
'discussions.noSources': { 
  ru: 'Нет источников', 
  en: 'No sources', 
  he: 'אין מקורות', 
  ar: 'لا توجد مصادر' 
},
'discussions.entries': { 
  ru: 'записей', 
  en: 'entries', 
  he: 'רשומות', 
  ar: 'مدخلات' 
},
'discussions.documents': { 
  ru: 'документов', 
  en: 'documents', 
  he: 'מסמכים', 
  ar: 'مستندات' 
},
```

---

### Файл 2: `src/pages/DiscussionsListPage.tsx`

**Изменение 1 (строка 46)** — Название новой сессии:
```tsx
// Было:
title: language === 'ru' ? 'Новое обсуждение' : 'New discussion',
// Стало:
title: t('discussions.newTitle'),
```

**Изменение 2 (строка 78)** — Подзаголовок:
```tsx
// Было:
{language === 'ru' ? 'Чат с записями' : 'Chat with entries'}
// Стало:
{t('discussions.subtitle')}
```

**Изменение 3 (строки 110, 113)** — RTL для SealGlyph:
```tsx
// Было:
<div className="absolute top-3 right-3 ...">
<div className="absolute bottom-3 left-3 ...">
// Стало:
<div className="absolute top-3 end-3 ...">
<div className="absolute bottom-3 start-3 ...">
```

**Изменение 4 (строки 152-154)** — Описание удаления:
```tsx
// Было:
{language === 'ru' 
  ? 'Это действие нельзя отменить. Все сообщения будут удалены.'
  : 'This action cannot be undone. All messages will be deleted.'}
// Стало:
{t('discussions.deleteDesc')}
```

---

### Файл 3: `src/components/discussions/SessionCard.tsx`

**Изменение 1 (строка 25)** — date-fns locale для he/ar:
```tsx
import { ru, enUS, he, ar } from 'date-fns/locale';

const localeMap: Record<string, Locale> = { ru, en: enUS, he, ar };
const locale = localeMap[language] || enUS;
```

**Изменение 2 (строка 66)** — ChevronRight RTL:
```tsx
// Было:
<ChevronRight className="... group-hover:translate-x-0.5 ..." />
// Стало:
<ChevronRight className="... rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 ..." />
```

**Изменение 3 (строка 75)** — DropdownMenu button position:
```tsx
// Было:
className="absolute top-2 right-2 ..."
// Стало:
className="absolute top-2 end-2 ..."
```

**Изменение 4 (строки 83, 90)** — DropdownMenuItem icons:
```tsx
// Было:
<Pin className="h-4 w-4 mr-2" />
<Trash2 className="h-4 w-4 mr-2" />
// Стало:
<Pin className="h-4 w-4 me-2" />
<Trash2 className="h-4 w-4 me-2" />
```

**Изменение 5 (строка 36)** — getScopeCountText вызов:
```tsx
// Было:
language as 'ru' | 'en'
// Стало:
language
```

---

### Файл 4: `src/lib/librarian/contextPack.ts`

**Изменение (строки 418-442)** — Расширить типизацию и добавить переводы:
```typescript
export function getScopeCountText(
  entryIds: number[],
  docIds: number[],
  language: string  // Было: 'ru' | 'en'
): string {
  const parts: string[] = [];
  
  const labels: Record<string, { entries: string; documents: string; noSources: string }> = {
    ru: { entries: 'записей', documents: 'документов', noSources: 'Нет источников' },
    en: { entries: 'entries', documents: 'documents', noSources: 'No sources' },
    he: { entries: 'רשומות', documents: 'מסמכים', noSources: 'אין מקורות' },
    ar: { entries: 'مدخلات', documents: 'مستندات', noSources: 'لا توجد مصادر' },
  };
  
  const l = labels[language] || labels.en;
  
  if (entryIds.length > 0) {
    parts.push(`${entryIds.length} ${l.entries}`);
  }
  
  if (docIds.length > 0) {
    parts.push(`${docIds.length} ${l.documents}`);
  }
  
  return parts.length === 0 ? l.noSources : parts.join(', ');
}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/i18n.tsx` | +6 ключей `discussions.*` |
| `src/pages/DiscussionsListPage.tsx` | Subtitle, newTitle, deleteDesc + RTL spacing |
| `src/components/discussions/SessionCard.tsx` | Locale, ChevronRight RTL, spacing |
| `src/lib/librarian/contextPack.ts` | Расширить getScopeCountText для he/ar |

---

## Результат

После изменений в Hebrew-режиме:
- **Подзаголовок**: "צ'אט עם רשומות" вместо "Chat with entries"
- **Новая сессия**: Создаётся с названием "דיון חדש"
- **Scope text**: "3 רשומות" вместо "3 entries"
- **SealGlyph**: Правильное зеркальное расположение в RTL
- **ChevronRight**: Указывает влево в RTL
- **DropdownMenu**: Кнопка слева в RTL
