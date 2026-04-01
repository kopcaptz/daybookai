
# Мульти-провайдерная система — ЗАВЕРШЕНО

## Статус: ✅ Все AI-сервисы поддерживают мульти-провайдеров

### Клиентские сервисы (передают `provider` и `model`):
- ✅ `aiService.ts` (чат)
- ✅ `biographyService.ts` (биография дня)
- ✅ `receiptService.ts` (сканирование чеков)
- ✅ `imageAnalysisService.ts` (анализ изображений)
- ✅ `entryAnalysisService.ts` (анализ записей)
- ✅ `weeklyInsightsService.ts` (недельные инсайты)
- ✅ `audioTranscriptionService.ts` (транскрипция аудио)
- ⏭️ `whisperService.ts` — остаётся на Lovable AI (фраза дня, 10 токенов)

### Edge Functions (маршрутизация через `getProviderConfig`):
- ✅ `ai-chat` — OpenRouter, MiniMax, Lovable
- ✅ `ai-biography` — OpenRouter, MiniMax, Lovable
- ✅ `ai-receipt` — OpenRouter, MiniMax, Lovable
- ✅ `ai-entry-analyze` — OpenRouter, MiniMax, Lovable
- ✅ `ai-weekly-insights` — OpenRouter, MiniMax, Lovable
- ✅ `ai-transcribe` — OpenRouter (если поддерживает multimodal), Lovable (fallback для MiniMax)
- ⏭️ `ai-whisper` — только Lovable AI (CORS обновлён)

### CORS:
- ✅ `x-ai-token` удалён из всех функций
- ✅ `x-provider-key` добавлен во все функции

### Секреты:
- ⚠️ `AI_ACCESS_PIN` и `AI_TOKEN_SECRET` остаются на сервере (пользователь отклонил удаление), но нигде не используются
