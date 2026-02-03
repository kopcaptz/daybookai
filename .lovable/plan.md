
# План: Центральная кнопка создаёт обсуждение на /discussions

## Идея

Убрать кнопку "+חדש" из header страницы Discussions. Вместо этого центральная кнопка в BottomNav будет:
- На `/discussions` → создавать новое обсуждение
- На других страницах → переходить на `/new` (как сейчас)

## Текущая архитектура

```
BottomNav.tsx:
├── Центральная кнопка → всегда /new (новая запись)
├── handleCenterClick() → startTransition(path='/new')

DiscussionsListPage.tsx:
├── Header содержит кнопку "+חדש"  
├── handleNewDiscussion() → createDiscussionSession()
```

## Решение

### Изменение 1: `src/components/BottomNav.tsx`

Добавить логику определения текущего route:

```tsx
const handleCenterClick = (e: React.MouseEvent) => {
  e.preventDefault();
  
  if (navigator.vibrate) {
    navigator.vibrate(15);
  }
  
  // На странице обсуждений — создаём новое обсуждение напрямую
  if (location.pathname === '/discussions') {
    // Dispatch custom event для DiscussionsListPage
    window.dispatchEvent(new CustomEvent('create-new-discussion'));
    return;
  }
  
  // На других страницах — переход на /new
  window.dispatchEvent(new CustomEvent('grimoire-ritual-start'));
  startTransition(centerButtonRef.current, item.path);
};
```

### Изменение 2: `src/pages/DiscussionsListPage.tsx`

1. Убрать кнопку "+חדש" из header
2. Добавить listener на event `create-new-discussion`:

```tsx
useEffect(() => {
  const handleCreateDiscussion = () => {
    handleNewDiscussion();
  };
  
  window.addEventListener('create-new-discussion', handleCreateDiscussion);
  return () => window.removeEventListener('create-new-discussion', handleCreateDiscussion);
}, []);
```

3. Упростить header (только заголовок по центру):

```tsx
<header className="sticky top-0 z-40 ...">
  <div className="text-center">
    <h1 className="text-xl font-serif ...">{t('discussions.title')}</h1>
    <p className="text-xs text-cyber-sigil/60 ...">{t('discussions.subtitle')}</p>
  </div>
  <div className="mt-4 rune-divider">...</div>
</header>
```

---

## Визуальный результат

**До:**
```
┌──────────────────────────────────────┐
│  [+חדש]  │  דיונים  │  [пусто]       │
└──────────────────────────────────────┘
         [Центральная кнопка] → /new
```

**После:**
```
┌──────────────────────────────────────┐
│           דיונים                     │
│       צ'אט עם רשומות                 │
└──────────────────────────────────────┘
         [Центральная кнопка] → новое обсуждение
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/BottomNav.tsx` | Добавить логику route-aware для центральной кнопки |
| `src/pages/DiscussionsListPage.tsx` | Убрать кнопку из header, добавить event listener |

---

## Преимущества

1. **Чистый header** — только заголовок, без лишних элементов
2. **Консистентный UX** — центральная кнопка всегда "создаёт что-то новое" в контексте текущей страницы
3. **Больше места** — FeedbackModal не конфликтует с кнопкой "+חדש"
4. **Интуитивно** — пользователи привыкнут, что большая кнопка = главное действие
