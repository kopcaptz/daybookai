

# Динамическая генерация AI PIN из админки

## Суть изменения

Вместо статического секрета `AI_ACCESS_PIN` в переменных окружения, PIN будет храниться в виде хеша в базе данных. Админ сможет в любой момент сгенерировать новый PIN прямо из панели управления. Старый PIN моментально перестанет работать.

## Как это будет работать

```text
Текущий поток:
  Пользователь вводит PIN --> ai-pin-verify --> сравнение с Deno.env.get("AI_ACCESS_PIN") --> токен

Новый поток:
  Пользователь вводит PIN --> ai-pin-verify --> хеширование --> сравнение с хешем из БД --> токен

Генерация нового PIN:
  Админ нажимает "Сгенерировать" --> admin-ai-pin-manage --> генерация 4-значного PIN --> 
  хеширование --> сохранение хеша в БД --> показ PIN админу (один раз)
```

## Детали реализации

### 1. Миграция БД: таблица `app_settings`

Создание таблицы для хранения настроек приложения (ключ-значение):

```sql
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Полная блокировка прямого доступа (как у остальных системных таблиц)
CREATE POLICY "Deny all direct access" ON public.app_settings
  AS RESTRICTIVE FOR ALL TO public USING (false);
```

Начальное значение -- хеш текущего PIN (чтобы не было downtime):

```sql
-- Захешировать текущий AI_ACCESS_PIN и записать как начальное значение
-- (будет выполнено в edge function при первой генерации)
```

### 2. Новая Edge Function: `admin-ai-pin-manage`

Защищенная функция (проверка admin-токена), которая:

- **POST** с `action: "generate"`:
  1. Генерирует случайный 4-значный PIN (crypto.getRandomValues)
  2. Хеширует его с `AI_TOKEN_SECRET` через SHA-256
  3. Сохраняет хеш в `app_settings` (ключ `ai_pin_hash`)
  4. Возвращает PIN в открытом виде (показывается админу один раз)
  5. Опционально: инвалидирует все текущие AI-токены

- **GET** (статус):
  1. Проверяет, есть ли запись `ai_pin_hash` в `app_settings`
  2. Возвращает `updated_at` (когда последний раз менялся PIN)

### 3. Изменение `ai-pin-verify`

Вместо:
```typescript
const AI_ACCESS_PIN = Deno.env.get("AI_ACCESS_PIN");
// ... сравнение
```

Новый подход:
```typescript
// Читаем хеш из БД
const { data } = await supabase
  .from("app_settings")
  .select("value")
  .eq("key", "ai_pin_hash")
  .single();

// Хешируем введенный PIN тем же способом
const inputHash = await hashPin(AI_TOKEN_SECRET, pin);

// Сравниваем хеши (constant-time)
const match = timingSafeEqual(inputHash, data.value);
```

Fallback: если в БД нет записи, проверяем старый `AI_ACCESS_PIN` из env (для обратной совместимости при первом деплое).

### 4. UI в админке: карточка управления PIN

На странице `AdminSystemPage.tsx` добавляется новая карточка "AI PIN-код":

- Показывает дату последней смены PIN
- Кнопка "Сгенерировать новый PIN"
- После генерации: модальное окно с крупным отображением нового PIN (с кнопкой копирования)
- Предупреждение: "Старый PIN перестанет работать. Запишите новый."
- Опция "Отозвать все активные сессии AI" (checkbox)

### 5. Инвалидация старых токенов (опционально)

При смене PIN можно автоматически обнулить все выданные AI-токены. Для этого добавляем в `app_settings` ещё одну запись -- `ai_token_epoch` (timestamp). При проверке токена в edge-функциях, если `token.iat < ai_token_epoch`, токен считается недействительным.

---

## Файлы, которые будут изменены / созданы

| Файл | Действие |
|---|---|
| Миграция SQL (app_settings) | Новый |
| `supabase/functions/admin-ai-pin-manage/index.ts` | Новый |
| `supabase/functions/ai-pin-verify/index.ts` | Изменение (чтение хеша из БД) |
| `src/pages/AdminSystemPage.tsx` | Изменение (добавление карточки PIN) |

## Безопасность

- PIN никогда не хранится в открытом виде -- только SHA-256 хеш
- Таблица `app_settings` закрыта RLS-политикой "Deny all" -- доступ только через service_role
- Генерация доступна только с валидным admin-токеном
- Rate limiting на `ai-pin-verify` сохраняется без изменений
- Constant-time сравнение хешей (защита от timing-атак)
- Fallback на старый env-переменную при переходном периоде

## Порядок реализации

1. Миграция БД (создание `app_settings`)
2. Edge Function `admin-ai-pin-manage`
3. Изменение `ai-pin-verify` (чтение из БД + fallback)
4. UI в `AdminSystemPage`
5. Тестирование: генерация PIN из админки, вход по новому PIN

