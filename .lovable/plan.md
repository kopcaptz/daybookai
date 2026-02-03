

# План: Удалять пустые обсуждения при выходе

## Проблема

Когда пользователь:
1. Создает новое обсуждение (кнопкой "+New")
2. Не отправляет ни одного сообщения
3. Нажимает "назад"

...пустая сессия сохраняется в списке обсуждений. Это засоряет список.

## Решение

Добавить `useEffect` с cleanup-функцией в `DiscussionChatPage.tsx`, которая при размонтировании компонента:
1. Проверяет количество сообщений в сессии
2. Если сообщений 0 — удаляет сессию

---

## Изменение: `src/pages/DiscussionChatPage.tsx`

### 1. Добавить импорт `deleteDiscussionSession`

```tsx
import { 
  getDiscussionSessionById, 
  getMessagesBySessionId, 
  addDiscussionMessage,
  updateDiscussionSession,
  deleteDiscussionSession,  // ← добавить
  DiscussionSession,
  DiscussionMessage,
  DiscussionMode
} from '@/lib/db';
```

### 2. Добавить useEffect для cleanup пустых сессий

После существующих useEffect (примерно после строки 103):

```tsx
// Cleanup empty session on unmount
useEffect(() => {
  return () => {
    // Use async IIFE for cleanup
    (async () => {
      try {
        const msgs = await getMessagesBySessionId(sessionId);
        if (msgs.length === 0) {
          await deleteDiscussionSession(sessionId);
          console.log('[DiscussionChat] Deleted empty session:', sessionId);
        }
      } catch (error) {
        console.error('[DiscussionChat] Failed to cleanup empty session:', error);
      }
    })();
  };
}, [sessionId]);
```

---

## Как это работает

```text
Пользователь создает сессию → открывается DiscussionChatPage
                                      ↓
                          Пользователь нажимает "←"
                                      ↓
                          useEffect cleanup выполняется
                                      ↓
                          Проверка: messages.length === 0?
                                   /          \
                                 Да           Нет
                                 ↓             ↓
                          deleteSession   (ничего)
```

---

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/pages/DiscussionChatPage.tsx` | Добавить импорт `deleteDiscussionSession` и useEffect для cleanup |

---

## Edge cases

1. **Пользователь отправил сообщение и вышел** — сессия сохранится (messages.length > 0)
2. **Ошибка при удалении** — логируется, не влияет на навигацию
3. **Быстрый переход между сессиями** — каждый cleanup работает со своим sessionId

