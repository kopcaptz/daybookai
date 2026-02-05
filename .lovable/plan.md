# План: Надёжный парсинг JSON в ai-biography ✅ ВЫПОЛНЕНО

## Статус: Реализовано

Все изменения из плана были успешно внедрены в `supabase/functions/ai-biography/index.ts`.

---

## Реализованные изменения

### 1. ✅ Увеличен maxTokens
```typescript
const effectiveMaxTokens = Math.min(maxTokens || 3072, MAX_TOKENS_LIMIT);
```

### 2. ✅ Добавлена функция extractJSON
- Раздельные балансы `braceBalance` и `bracketBalance`
- Снятие markdown fence (opening всегда, closing если есть)
- Диагностика: `contentLength`, `startsWithFence`, `endsWithFence`, `hasFenceAnywhere`, `lastChar`
- Определение truncation после `JSON.parse`, а не до

### 3. ✅ Добавлена функция isValidBiographyShape
- Проверка наличия `narrative` или `story`
- Валидация структуры `highlights` и `timeline`
- Проверка элементов timeline на наличие `summary` или `timeLabel`

### 4. ✅ Улучшенная обработка ошибок
- HTTP 502 для truncated
- HTTP 500 для parse_error и invalid_schema
- Разные errorCode: `truncated`, `parse_error`, `invalid_schema`

### 5. ✅ Расширенное логирование
- `effectiveMaxTokens` в логах
- `response_length` для диагностики
- `tokens_used` вместо `tokens`

---

## Smoke-test

1. Открыть страницу "Сегодня" с записями
2. Нажать "Повторить" на карточке биографии
3. Проверить успешную генерацию
4. Если ошибка — проверить логи edge function:
   - `ai_biography_truncated` → повторить; если стабильно, увеличить maxTokens
   - `ai_biography_invalid_schema` → модель вернула не ту структуру
   - `ai_biography_parse_error` → синтаксическая ошибка в JSON
