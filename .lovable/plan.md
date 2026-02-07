

# ТЗ: Три приоритетных исправления

---

## 1. Исправление Build Timestamp в настройках

**Проблема:** В разделе "О приложении" на странице настроек строка `Build:` показывает **текущее время рендера** вместо реального времени сборки.

Текущий код (строка 483 в `SettingsPage.tsx`):
```
Build: {import.meta.env.MODE === 'production' ? new Date().toISOString()... : 'dev'}
```

При этом в `vite.config.ts` уже определена константа `__BUILD_TIMESTAMP__`, а в `vite-env.d.ts` она объявлена как тип. Просто никто не подключил её к UI.

**Исправление:** Заменить `new Date().toISOString()` на `__BUILD_TIMESTAMP__` в одной строке файла `SettingsPage.tsx`.

**Файлы:** `src/pages/SettingsPage.tsx` (1 строка)

---

## 2. Интернационализация ErrorBoundary

**Проблема:** Компонент `ErrorBoundary` содержит 6 захардкоженных русских строк. Пользователи на EN, HE, AR видят русский текст при ошибках.

Захардкоженные строки:
- "Доступна новая версия"
- "Приложение было обновлено. Нажмите кнопку для загрузки новой версии."
- "Обновить приложение"
- "Что-то пошло не так"
- "Произошла ошибка при отображении этого компонента"
- "Попробовать снова"

**Сложность:** `ErrorBoundary` -- это class component, поэтому нельзя использовать хук `useI18n()`. Решение -- читать язык из `localStorage` напрямую (ключ `daybook-language`, как делает `I18nProvider`).

**Исправление:**
1. Добавить 6 ключей в объект `translations` в `src/lib/i18n.tsx`:
   - `error.newVersion`, `error.newVersionDesc`, `error.reload`
   - `error.title`, `error.desc`, `error.retry`
2. В `ErrorBoundary.tsx` создать вспомогательную функцию `getLanguage()`, которая читает из `localStorage` и возвращает `Language`.
3. Создать функцию `translate(key)`, которая получает нужную строку из `translations` по текущему языку.
4. Заменить все 6 строк на вызовы `translate()`.

**Файлы:** `src/components/ErrorBoundary.tsx`, `src/lib/i18n.tsx`

---

## 3. Дедупликация AI-утилит

**Проблема:** Три файла содержат идентичный код:

| Функция / Паттерн | aiService.ts | biographyService.ts | imageAnalysisService.ts |
|---|---|---|---|
| `getAITokenHeader()` | строки 21-27 | строки 26-32 | строки 16-22 |
| `parseAIError()` | строки 186-203 | строки 144-158 | -- |
| SSE-парсинг потока | строки 289-323 | -- | строки 245-283 |

Это 3 копии `getAITokenHeader()`, 2 копии `parseAIError()`, 2 копии SSE-парсера. Примерно 90 строк дублированного кода.

**Исправление:** Создать `src/lib/aiUtils.ts` с тремя экспортируемыми функциями:

```text
src/lib/aiUtils.ts
  - getAITokenHeader(): Record<string, string>
  - parseAIError(status, language): string  
  - collectSSEStream(response, onToken?): Promise<string>
```

Затем заменить все дубликаты на импорты из `aiUtils.ts`:

- `aiService.ts` -- удалить локальные `getAITokenHeader()`, `parseAIError()`, вынести SSE-парсинг
- `biographyService.ts` -- удалить локальные `getAITokenHeader()`, `parseAIError()`
- `imageAnalysisService.ts` -- удалить локальную `getAITokenHeader()`, заменить `collectStreamResponse()` на `collectSSEStream()`

**Файлы:** Новый `src/lib/aiUtils.ts`, + изменения в 3 файлах

---

## Порядок реализации

1. **Build Timestamp** (1 минута, 1 файл) -- мгновенный результат, 0 рисков
2. **ErrorBoundary i18n** (5 минут, 2 файла) -- улучшение UX для 3/4 языков
3. **AI Utils дедупликация** (10 минут, 4 файла) -- снижение техдолга, облегчение сопровождения

## Технические детали

- Никаких новых зависимостей
- Никаких миграций БД
- Никаких изменений в Edge Functions
- Полная обратная совместимость -- внешнее поведение не меняется

