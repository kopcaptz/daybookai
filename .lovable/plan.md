

# Сделать провайдеров рабочими: ввод API-ключей в настройках

## Что сейчас не работает
Кнопки OpenRouter/MiniMax переключают провайдера в настройках, но:
- Нет полей для ввода API-ключей пользователем
- Ключи не передаются в Edge Function
- MiniMax вообще не сконфигурирован на сервере

## Что будет сделано

### 1. `src/lib/aiConfig.ts` — новые поля в настройках
- Добавить `openrouterApiKey: string` и `minimaxApiKey: string` в `AISettings`
- Хранятся в localStorage как и остальные настройки

### 2. `src/components/AISettingsCard.tsx` — поля ввода ключей
- При выборе OpenRouter → показать поле ввода с type="password" + кнопка 👁
- При выборе MiniMax → аналогично
- Lovable → поле не нужно (серверный ключ)
- Ссылки "Где взять ключ?" → openrouter.ai/keys / platform.minimaxi.com
- Предупреждение если ключ пустой

### 3. `src/lib/aiService.ts` — передача ключа в заголовке
- При provider !== 'lovable' добавлять заголовок `X-Provider-Key` с ключом из настроек
- Аналогично в `testAIConnection()`

### 4. `supabase/functions/ai-chat/index.ts` — приём ключа из заголовка
- Добавить `x-provider-key` в CORS `Access-Control-Allow-Headers`
- В `getProviderConfig()`: если есть `X-Provider-Key` из запроса — использовать его вместо серверного секрета
- Lovable всегда использует серверный `LOVABLE_API_KEY`

### 5. `supabase/functions/ai-test/index.ts` — то же самое
- Принимать `X-Provider-Key` и использовать для теста соединения

### 6. `src/lib/i18n.tsx` — локализация
- "API ключ", "Введите API ключ", "Где взять ключ?", "Ключ не указ