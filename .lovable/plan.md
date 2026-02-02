
# Исправление ошибки "Failed to fetch dynamically imported module"

## Проблема

Пользователь на Android Chrome (3G сеть) получил ошибку при попытке загрузить главную страницу. Это классическая проблема PWA-приложений:

1. После деплоя новой версии хеши JS-файлов меняются
2. Service Worker или браузер держит старый index.html в кеше  
3. Старый index.html пытается загрузить несуществующий chunk
4. Медленная 3G сеть усугубляет проблему таймаутами

## Решение

Добавить **автоматическое восстановление** при ошибках динамического импорта:

### 1. Обёртка для lazy-импортов с retry и автоперезагрузкой

Создать утилиту `lazyWithRetry` которая:
- Пытается загрузить chunk 2 раза
- При неудаче — автоматически перезагружает страницу (1 раз за сессию)
- Записывает в sessionStorage флаг чтобы не зациклиться

### 2. Обновление App.tsx

Заменить все `lazy(() => import(...))` на `lazyWithRetry(() => import(...))`.

### 3. Улучшение ErrorBoundary

Добавить специальную обработку для ошибок chunk-загрузки:
- Распознавать `Failed to fetch dynamically imported module`
- Предлагать кнопку "Обновить приложение" вместо "Попробовать снова"

## Изменяемые файлы

| Файл | Изменение |
|------|-----------|
| `src/lib/lazyWithRetry.ts` | **Новый** — утилита для lazy import с retry |
| `src/App.tsx` | Заменить `lazy()` на `lazyWithRetry()` |
| `src/components/ErrorBoundary.tsx` | Добавить распознавание chunk-ошибок |

## Техническая реализация

### lazyWithRetry.ts

```typescript
import { lazy, ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-attempted';

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      // Retry once
      try {
        await new Promise(r => setTimeout(r, 1000));
        return await importFn();
      } catch (retryError) {
        // Check if we already tried reloading
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
        }
        throw retryError;
      }
    }
  });
}
```

### ErrorBoundary — распознавание chunk-ошибки

```typescript
private isChunkLoadError(): boolean {
  const msg = this.state.error?.message || '';
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch')
  );
}
```

При chunk-ошибке показывать:
- Текст: "Доступна новая версия приложения"
- Кнопка: "Обновить" (перезагрузка страницы)

## Результат

- Пользователи не будут видеть белый экран после обновлений
- Автоматический retry защитит от временных сетевых сбоев
- Если chunk устарел — автоматическая перезагрузка один раз
- Если перезагрузка не помогла — понятное сообщение с кнопкой
