

# Пропущенная функция: `biographyService` не передаёт `provider` в Edge Function

## Проблема

После добавления мульти-провайдерной системы, **`biographyService.ts`** отправляет `X-Provider-Key` (через `getAITokenHeader()`), но **не передаёт `provider`** в теле запроса. Edge Function `ai-biography` не знает, какой провайдер выбран, и всегда использует Lovable AI.

Аналогичная ситуация с `receiptService.ts` — там тоже нет `provider` в body (хотя `X-Provider-Key` передаётся).

Также `biographyService` отправляет модель из `profileConfig.model` (дефолтную Lovable-модель), а не из `PROVIDER_MODELS[settings.provider][profile]`.

## Что нужно исправить

### 1. `src/lib/biographyService.ts`
- Добавить `loadAISettings()` и `PROVIDER_MODELS` в вызов `generateBiography()`
- Отправлять `provider: settings.provider` в body
- Использовать `PROVIDER_MODELS[settings.provider][profile]` вместо `profileConfig.model`

### 2. `src/lib/receiptService.ts`
- Добавить `provider: settings.provider` в body запроса к `ai-receipt`

### 3. Edge Functions `ai-biography` и `ai-receipt`
- Убедиться что они читают `provider` из body и используют `X-Provider-Key` для маршрутизации (это было в плане ранее — нужно проверить текущее состояние)

## Результат
Когда пользователь выбирает OpenRouter в настройках и вводит ключ — биография и чеки тоже будут генерироваться через OpenRouter, а не только чат.

