
# ТЗ: Rate Limiting для PIN-верификации

## Анализ угрозы

| Параметр | AI PIN | Admin PIN |
|----------|--------|-----------|
| Длина | 4 цифры | 4+ цифр |
| Возможных комбинаций | 10,000 | 10,000+ |
| Время перебора без защиты | ~17 минут* | ~17 минут* |
| TTL токена | 7 дней | 24 часа |

*При 10 запросах/секунду = 1000 минут / 60 = 16.7 минут до полного перебора

### Текущие защиты:
- Constant-time сравнение (защита от timing attacks)
- Origin проверка (но curl обходит)
- Логирование неудачных попыток

### Отсутствующие защиты:
- **Rate limiting** — главная проблема
- Блокировка после N неудачных попыток
- Captcha / proof-of-work

---

## Решение: Database-backed Rate Limiting

### Почему база данных?

Edge Functions в Deno Deploy — stateless. In-memory rate limiting работает только в рамках одного "холодного старта" и не сохраняется между запросами. Единственный надёжный способ — хранить счётчики в базе данных.

### Архитектура

```text
┌──────────────────────────────────────────────────────────────┐
│                    Клиент (браузер)                          │
└──────────────────────────────┬───────────────────────────────┘
                               │ POST { pin: "1234" }
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  ai-pin-verify / admin-pin-verify            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 1. Получить IP клиента                                  │ │
│  │ 2. Проверить rate limit (SELECT FROM rate_limits)       │ │
│  │ 3. Если blocked → 429 + Retry-After                     │ │
│  │ 4. Проверить PIN                                        │ │
│  │ 5. Обновить счётчик (INSERT/UPDATE rate_limits)         │ │
│  │ 6. Если fail_count >= 5 → заблокировать на 15 минут     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Таблица: rate_limits                      │
│  ┌───────────────┬─────────────┬────────────┬─────────────┐  │
│  │ identifier    │ fail_count  │ blocked_at │ expires_at  │  │
│  │ (IP + type)   │ (integer)   │ (timestamp)│ (timestamp) │  │
│  └───────────────┴─────────────┴────────────┴─────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Технические изменения

### 1. Создать таблицу `rate_limits`

```sql
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  fail_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(identifier, endpoint)
);

-- Индекс для быстрого поиска
CREATE INDEX idx_rate_limits_lookup ON rate_limits(identifier, endpoint);

-- Автоматическая очистка старых записей (опционально)
-- Записи старше 24 часов можно удалять
```

**RLS**: Таблица используется только edge functions с service role key — RLS не нужен.

### 2. Обновить `ai-pin-verify/index.ts`

Добавить проверку rate limit перед валидацией PIN:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Rate limit configuration
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,       // Максимум попыток
  BLOCK_DURATION_MS: 15 * 60 * 1000,  // Блокировка на 15 минут
  CLEANUP_AFTER_MS: 24 * 60 * 60 * 1000,  // Очистка через 24 часа
};

async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const { data } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('endpoint', endpoint)
    .single();

  if (!data) return { allowed: true };

  // Проверить блокировку
  if (data.blocked_until && new Date(data.blocked_until) > new Date()) {
    const retryAfter = Math.ceil(
      (new Date(data.blocked_until).getTime() - Date.now()) / 1000
    );
    return { allowed: false, retryAfter };
  }

  // Если блокировка истекла — сбросить счётчик
  if (data.blocked_until && new Date(data.blocked_until) <= new Date()) {
    await supabase
      .from('rate_limits')
      .update({ fail_count: 0, blocked_until: null })
      .eq('identifier', identifier)
      .eq('endpoint', endpoint);
    return { allowed: true };
  }

  return { allowed: true };
}

async function recordFailedAttempt(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string
): Promise<void> {
  const { data } = await supabase
    .from('rate_limits')
    .select('fail_count')
    .eq('identifier', identifier)
    .eq('endpoint', endpoint)
    .single();

  const newCount = (data?.fail_count || 0) + 1;
  const shouldBlock = newCount >= RATE_LIMIT.MAX_ATTEMPTS;

  await supabase
    .from('rate_limits')
    .upsert({
      identifier,
      endpoint,
      fail_count: newCount,
      last_attempt_at: new Date().toISOString(),
      blocked_until: shouldBlock 
        ? new Date(Date.now() + RATE_LIMIT.BLOCK_DURATION_MS).toISOString()
        : null,
    }, { onConflict: 'identifier,endpoint' });
}

async function clearRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string
): Promise<void> {
  await supabase
    .from('rate_limits')
    .delete()
    .eq('identifier', identifier)
    .eq('endpoint', endpoint);
}
```

### 3. Получение IP клиента

В Supabase Edge Functions IP доступен через заголовок:

```typescript
function getClientIdentifier(req: Request): string {
  // Supabase добавляет реальный IP в x-forwarded-for
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  return ip;
}
```

### 4. Обновить `admin-pin-verify/index.ts`

Аналогичные изменения с использованием `endpoint: 'admin-pin'`.

---

## Параметры защиты

| Параметр | Значение | Обоснование |
|----------|----------|-------------|
| MAX_ATTEMPTS | 5 | 5 попыток = 0.05% вероятность угадать |
| BLOCK_DURATION | 15 минут | Достаточно для защиты, не раздражает легитимных пользователей |
| Reset on success | Да | Успешный вход сбрасывает счётчик |

### Эффективность

С rate limiting для перебора 10,000 комбинаций потребуется:
- 10,000 / 5 = 2,000 блокировок
- 2,000 × 15 мин = 30,000 минут = **20+ дней**

---

## Улучшения на клиенте

### Показывать предупреждение о блокировке

В `src/lib/aiTokenService.ts` и UI:

```typescript
// Если сервер вернул 429
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  return {
    success: false,
    error: 'rate_limited',
    retryAfter: parseInt(retryAfter || '900', 10),
  };
}
```

### UI компонент

Показывать таймер обратного отсчёта:

```text
┌─────────────────────────────────────────────────┐
│ ⚠️ Слишком много попыток                        │
│                                                 │
│ Повторите через: 14:32                          │
│ [____________________________]                  │
└─────────────────────────────────────────────────┘
```

---

## Файлы для изменения

1. **Миграция БД** — создать таблицу `rate_limits`
2. **supabase/functions/ai-pin-verify/index.ts** — добавить rate limiting
3. **supabase/functions/admin-pin-verify/index.ts** — добавить rate limiting  
4. **src/lib/aiTokenService.ts** — обработка 429 ответа
5. **src/components/AIPinDialog.tsx** — UI для блокировки

---

## Проверки после реализации

1. Ввести неправильный PIN 5 раз → получить блокировку (429)
2. Подождать 15 минут (или уменьшить для теста) → блокировка снята
3. Ввести правильный PIN → счётчик сбрасывается
4. Проверить логи на записи о блокировках
