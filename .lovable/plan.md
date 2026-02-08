

# Аудит логики AI-агента: полный анализ разрешений и безопасности

## Общая оценка: 7.5/10

Cursor правильно выявил ключевые проблемы. Ниже -- подтвержденная карта уязвимостей с приоритетами и план исправлений.

---

## 1. Карта Edge-функций: токены и CORS

```text
+------------------------+------------+-----------+---------------------+
| Edge Function          | X-AI-Token | CORS      | Отправляемые данные |
+========================+============+===========+=====================+
| ai-chat                | YES        | Whitelist | SSE stream, system  |
| ai-test                | YES        | Whitelist | "Hi" (тест)        |
| ai-biography           | YES        | Whitelist | Темы, теги, mood    |
| ai-weekly-insights     | YES        | Whitelist | Теги, mood, 100 chr |
| ai-transcribe          | YES        | Whitelist | Аудио blob          |
| ai-receipt             | YES        | Whitelist | Фото чека           |
| ai-entry-analyze       | NO (!!!)   | * (!!!)   | ПОЛНЫЙ ТЕКСТ записи |
| ai-whisper             | NO         | * (!!!)   | Время, сезон, день  |
+------------------------+------------+-----------+---------------------+
```

---

## 2. Критические уязвимости (подтвержденные)

### 2.1 КРИТИЧНО: `ai-entry-analyze` без токена + CORS: *

**Что происходит:** Функция принимает полный текст дневниковой записи (до 1000 символов) и отправляет его в AI Gateway. При этом:
- Нет проверки `X-AI-Token` на сервере (нет `validateAIToken`)
- CORS-заголовок: `Access-Control-Allow-Origin: *`
- Любой сайт в интернете может вызвать эту функцию с произвольным текстом

**Почему это плохо:**
- Злоумышленник может использовать ваш LOVABLE_API_KEY бесплатно (cost abuse)
- Нет лимита запросов -- исчерпание квоты

**Кто вызывает на клиенте:**
- `entryAnalysisService.ts` -- через `supabase.functions.invoke()` (без X-AI-Token)
- `usePredictiveMood.ts` -- через `supabase.functions.invoke()` (без X-AI-Token)

**Клиентская проверка есть**, но она недостаточна:
- `entryAnalysisService.ts` проверяет `isAITokenValid()` локально, но НЕ отправляет токен на сервер
- `usePredictiveMood.ts` вообще не проверяет токен -- полагается на `aiSettings.autoMood`

### 2.2 СРЕДНЕ: `ai-whisper` без токена + CORS: *

**Что происходит:** Функция не получает пользовательских данных (только время/сезон), но:
- Нет проверки токена
- CORS: `*`
- Может использоваться для бесплатного доступа к AI Gateway

**Риск:** Низкий для приватности (данные не отправляются), но средний для cost abuse.

### 2.3 СРЕДНЕ: `strictPrivacy` не покрывает `ai-entry-analyze`

**Что происходит:**
- В `aiService.ts` при `strictPrivacy: true` текст парафразируется (темы/настроения вместо цитат)
- В `biographyService.ts` отправляются только обобщенные темы, НИКОГДА сырой текст
- Но `ai-entry-analyze` отправляет ПОЛНЫЙ ТЕКСТ (до 1000 символов) вне зависимости от настройки `strictPrivacy`
- `weeklyInsightsService.ts` отправляет первые 100 символов текста (`e.text.slice(0, 100)`)

---

## 3. Что работает хорошо (подтверждено)

- **ai-chat**: Полная валидация токена, CORS whitelist, input validation (модель, tokens, temperature, messages)
- **ai-biography**: Образцовая приватность -- только темы/теги/mood, никогда сырой текст
- **ai-pin-verify**: Rate limiting (5 попыток / 15 мин), constant-time сравнение, HMAC-SHA256
- **Retry-система**: `aiAuthRecovery.ts` -- concurrency-safe shared promise для PIN-диалога
- **ai-transcribe**: Валидация токена, MIME-тип, размер файла (25MB)
- **ai-receipt**: Валидация токена

---

## 4. План исправлений

### Задача 1: Добавить X-AI-Token в `ai-entry-analyze` (КРИТИЧНО)

**Серверная часть** (`supabase/functions/ai-entry-analyze/index.ts`):
- Заменить `CORS: *` на whitelist (как в `ai-chat`)
- Добавить функцию `validateAIToken()` (скопировать из `ai-chat`)
- Добавить `x-ai-token` в `Access-Control-Allow-Headers`
- Проверять токен перед обработкой запроса, возвращать 401 при невалидном

**Клиентская часть** (`src/lib/entryAnalysisService.ts`):
- Импортировать `getAITokenHeader` из `./aiUtils`
- Добавить заголовок `X-AI-Token` при вызове через `fetch` вместо `supabase.functions.invoke`
- Или передать headers в `supabase.functions.invoke`

**Клиентская часть** (`src/hooks/usePredictiveMood.ts`):
- Добавить `getAITokenHeader()` при вызове `supabase.functions.invoke`
- Добавить проверку `isAITokenValid()` перед вызовом AI

### Задача 2: Добавить X-AI-Token в `ai-whisper` (СРЕДНЕ)

**Серверная часть** (`supabase/functions/ai-whisper/index.ts`):
- Заменить `CORS: *` на whitelist
- Добавить `validateAIToken()`

**Клиентская часть** (`src/lib/whisperService.ts`):
- Добавить `getAITokenHeader()` к запросу
- Добавить fallback при отсутствии токена (использовать `getFallbackWhisper`)

### Задача 3: Учитывать `strictPrivacy` в `ai-entry-analyze` (СРЕДНЕ)

**Клиентская часть** (`src/lib/entryAnalysisService.ts`):
- Загрузить `aiSettings.strictPrivacy`
- При `strictPrivacy: true` -- отправлять только обобщенные темы (использовать `extractThemes()` из `biographyService.ts`) вместо полного текста
- Это снизит качество анализа, но обеспечит приватность

**Клиентская часть** (`src/lib/weeklyInsightsService.ts`):
- При `strictPrivacy: true` -- не отправлять `text` (только `semanticTags`, `mood`, `title`)

### Задача 4: Дедупликация `validateAIToken` (НИЗКИЙ ПРИОРИТЕТ)

Функция `validateAIToken` скопирована в 7 Edge-функциях. Можно вынести в shared файл, но это ограничение Edge Functions (нет импорта между папками). Оставить как есть -- это нормальная практика для Edge Functions.

---

## Технический план реализации

1. `supabase/functions/ai-entry-analyze/index.ts` -- добавить CORS whitelist + token validation
2. `supabase/functions/ai-whisper/index.ts` -- добавить CORS whitelist + token validation  
3. `src/lib/entryAnalysisService.ts` -- добавить `X-AI-Token` header + strictPrivacy check
4. `src/hooks/usePredictiveMood.ts` -- добавить `isAITokenValid()` guard + token header
5. `src/lib/whisperService.ts` -- добавить `X-AI-Token` header + fallback на локальные фразы
6. `src/lib/weeklyInsightsService.ts` -- убрать `text` при `strictPrivacy: true`

Все изменения обратно совместимы -- существующий flow с PIN-диалогом и HMAC-токенами остается прежним. Просто `ai-entry-analyze` и `ai-whisper` теперь будут в той же защитной модели, что и остальные 6 AI-функций.

