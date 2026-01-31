

# План исправления: загрузка изображений в фидбеке

## Проблема

Изображения не загружаются потому что `supabase.functions.invoke()` не поддерживает отправку `FormData` с файлами корректно. SDK автоматически сериализует тело запроса в JSON, из-за чего файл теряется.

База данных подтверждает: `image_url = null` для записи "Test feedback message".

## Решение

Использовать прямой `fetch` запрос к edge function вместо `supabase.functions.invoke`:

```text
┌─────────────────┐       fetch + FormData        ┌────────────────────┐
│  FeedbackModal  │  ─────────────────────────►   │  feedback-submit   │
│   (клиент)      │   multipart/form-data         │   (edge function)  │
└─────────────────┘                               └────────────────────┘
```

## Изменения

### 1. Файл: `src/components/FeedbackModal.tsx`

Заменить вызов `supabase.functions.invoke` на прямой `fetch`:

```typescript
// Было:
const { data, error } = await supabase.functions.invoke('feedback-submit', {
  body: formData,
});

// Станет:
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback-submit`,
  {
    method: 'POST',
    body: formData,
    // Важно: НЕ устанавливать Content-Type, 
    // браузер сам добавит multipart/form-data с boundary
  }
);
const data = await response.json();
```

### 2. Файл: `supabase/functions/feedback-submit/index.ts`

Добавить логирование для отладки и убедиться что `req.formData()` правильно парсит данные:

```typescript
// Добавить логи
console.log({ 
  requestId, 
  action: "feedback_received", 
  hasImage: !!image,
  imageSize: image?.size,
  imageName: image?.name 
});
```

## Технические детали

| Аспект | До | После |
|--------|-----|-------|
| Метод вызова | `supabase.functions.invoke` | Прямой `fetch` |
| Content-Type | JSON (неверно) | multipart/form-data |
| Файл | Теряется при сериализации | Передаётся корректно |

## Проверка после исправления

1. Отправить фидбек с изображением через "Магическую почту"
2. Перейти в `/admin/feedback`
3. Убедиться что изображение отображается в карточке

