

# Убрать серверный VITE_AI_API_KEY — использовать только пользовательские ключи

## Что сейчас
Секрет `VITE_AI_API_KEY` (OpenRouter ключ) хранится на сервере и используется как fallback в 4 Edge Functions:
- `ai-chat` — fallback если нет `LOVABLE_API_KEY`
- `ai-test` — fallback для теста
- `ai-biography` — fallback если нет `LOVABLE_API_KEY`  
- `ai-receipt` — fallback если нет `LOVABLE_API_KEY`

## Что нужно сделать

### 1. Убрать все `Deno.env.get("VITE_AI_API_KEY")` из Edge Functions
- **`ai-chat/index.ts`**: Убрать fallback на `VITE_AI_API_KEY` в `getProviderConfig()` (строки 273, 306). OpenRouter работает только через `providerKey` из заголовка `X-Provider-Key`.
- **`ai-test/index.ts`**: Аналогично — убрать fallback (строки 66, 112).
- **`ai-biography/index.ts`**: Убрать `OPENROUTER_API_KEY` fallback (строки 826, 839). Добавить поддержку `X-Provider-Key` заголовка как в ai-chat.
- **`ai-receipt/index.ts`**: То же самое (строки 363, 376). Добавить поддержку `X-Provider-Key`.

### 2. Обновить `ai-biography` и `ai-receipt` — добавить провайдер-роутинг
Эти функции пока не поддерживают `provider` и `X-Provider-Key`. Нужно:
- Принимать `provider` из body
- Читать `X-Provider-Key` из заголовка
- Использовать ту же логику маршрутизации что в `ai-chat`

### 3. Удалить секрет `VITE_AI_API_KEY` с сервера
- После деплоя — удалить через инструменты

## Результат
- Lovable AI работает через серверный `LOVABLE_API_KEY` (без изменений)
- OpenRouter/MiniMax работают **только** через ключи введённые пользователем в настройках
- Нет серверных ключей третьих сторон

