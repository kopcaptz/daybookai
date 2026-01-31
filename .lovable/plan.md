

# План: Улучшение контекста записей и скрытие кнопки обратной связи

## Обзор изменений

Реализуем подход B+C для решения проблемы пустого контекста записей и скроем кнопку обратной связи на страницах обсуждений.

---

## Изменение 1: Скрыть FeedbackModal на страницах обсуждений

**Файл:** `src/App.tsx`

Добавить `/discussions/` в условие `hideFeedback` (строка 102-105):

```typescript
// Было:
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/');

// Станет:
const hideFeedback = location.pathname.startsWith('/admin') || 
  location.pathname === '/onboarding' ||
  location.pathname === '/new' ||
  location.pathname.startsWith('/entry/') ||
  location.pathname.startsWith('/discussions/');
```

---

## Изменение 2: Автоактивация findMode при пустом scope

**Файл:** `src/pages/DiscussionChatPage.tsx`

Добавить `useEffect` после существующего `useEffect` для mode (строка 48-53):

```typescript
// Auto-enable findMode when scope is empty
useEffect(() => {
  if (session && 
      session.scope.entryIds.length === 0 && 
      session.scope.docIds.length === 0) {
    setFindMode(true);
  }
}, [session?.scope.entryIds.length, session?.scope.docIds.length]);
```

---

## Изменение 3: Подсказка в пустом состоянии

**Файл:** `src/pages/DiscussionChatPage.tsx`

Обновить блок пустого состояния (строки 202-208) — добавить информацию о режиме поиска:

```tsx
{(!messages || messages.length === 0) && (
  <div className="text-center py-12 space-y-3">
    {session.scope.entryIds.length === 0 && session.scope.docIds.length === 0 ? (
      <>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
          <Search className="h-3.5 w-3.5" />
          {language === 'ru' ? 'Режим «Найти в записях» активен' : 'Find in notes mode active'}
        </div>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          {language === 'ru' 
            ? 'AI будет искать релевантные записи автоматически. Или добавьте записи через кнопку «Контекст».'
            : 'AI will search for relevant entries automatically. Or add entries via the Context button.'}
        </p>
      </>
    ) : (
      <p className="text-muted-foreground">
        {t('discussion.placeholder')}
      </p>
    )}
  </div>
)}
```

---

## Файлы для изменения

| Файл | Строки | Изменение |
|------|--------|-----------|
| `src/App.tsx` | 102-105 | Добавить `/discussions/` в `hideFeedback` |
| `src/pages/DiscussionChatPage.tsx` | ~54 | Добавить `useEffect` для авто-findMode |
| `src/pages/DiscussionChatPage.tsx` | 202-208 | Обновить пустое состояние с подсказкой |

---

## Проверки после реализации

1. Открыть страницу обсуждения `/discussions/:id` — кнопка гримуара не отображается
2. Создать новое обсуждение без выбора записей — toggle "Найти в записях" активен
3. В пустом чате видна подсказка о режиме поиска
4. Отправить сообщение — AI находит записи и отвечает с контекстом

