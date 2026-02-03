

# План: Добавить кнопку "Новое обсуждение" на страницу Discussions

## Проблема

После предыдущих изменений кнопка "+New" была полностью убрана из header. Пользователь хочет, чтобы была видимая кнопка для создания нового обсуждения.

## Решение

Добавить кнопку обратно в header с правильной поддержкой RTL:
- В LTR (рус/англ): кнопка **справа** от заголовка
- В RTL (иврит/араб): кнопка **слева** от заголовка (визуально справа в RTL)

---

## Изменение: `src/pages/DiscussionsListPage.tsx`

### 1. Добавить импорты

```tsx
import { Plus, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isRTL } from '@/lib/i18n';
```

### 2. Обновить header (строки 78-93)

Заменить простой centered header на flex-layout с кнопкой:

```tsx
<header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
  <div className="flex items-center justify-between">
    {/* Spacer для баланса (в LTR — слева) */}
    <div className="w-20" />
    
    {/* Centered title */}
    <div className="text-center flex-1">
      <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
        {t('discussions.title')}
      </h1>
      <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
        {t('discussions.subtitle')}
      </p>
    </div>
    
    {/* New button (справа в LTR, слева в RTL — но визуально всегда справа) */}
    <Button
      variant="ghost"
      size="sm"
      onClick={handleNewDiscussion}
      disabled={creating}
      className="gap-1.5"
    >
      {creating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      <span>{t('discussions.new')}</span>
    </Button>
  </div>
  
  {/* Rune divider */}
  <div className="mt-4 rune-divider">
    <span className="sigil-separator">◆</span>
  </div>
</header>
```

---

## Как это работает для RTL

Flexbox с `justify-between` автоматически:
- **LTR**: `[spacer] | [title] | [button]` — кнопка справа ✓
- **RTL**: `[button] | [title] | [spacer]` — кнопка слева визуально, но это правая сторона RTL ✓

Не нужно `rtl:flex-row-reverse` — flexbox сам адаптируется к `dir="rtl"`.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/pages/DiscussionsListPage.tsx` | Добавить кнопку "+New" в header с правильным RTL layout |

---

## Визуальный результат

**English/Russian (LTR):**
```
┌───────────────────────────────────────┐
│           Discussions        [+ New]  │
│         Chat with entries             │
└───────────────────────────────────────┘
```

**Hebrew/Arabic (RTL):**
```
┌───────────────────────────────────────┐
│  [+ חדש]          דיונים              │
│              צ'אט עם רשומות           │
└───────────────────────────────────────┘
```

