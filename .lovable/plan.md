

# Техническое задание: Админ-панель для управления фидбеком

## 1. Обзор

Создание защищённой админ-панели для просмотра и управления сообщениями пользователей (фидбек с текстом и скриншотами/фото).

## 2. Архитектура решения

```text
+------------------+      +-------------------+      +------------------+
|  FeedbackModal   | ---> |  feedback-submit  | ---> |   Lovable Cloud  |
|  (Пользователь)  |      |  Edge Function    |      |   Database       |
+------------------+      +-------------------+      +------------------+
                                                            |
                                                            v
                          +-------------------+      +------------------+
                          |  Admin Panel      | <--- |   Storage Bucket |
                          |  /admin/feedback  |      |   (images)       |
                          +-------------------+      +------------------+
```

## 3. Компоненты системы

### 3.1. База данных

**Таблица `feedback`:**
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid | Primary key |
| message | text | Текст сообщения |
| image_url | text | URL изображения в Storage (nullable) |
| device_info | jsonb | User-agent, viewport, язык |
| status | enum | new, read, resolved, archived |
| created_at | timestamptz | Время создания |
| admin_notes | text | Заметки администратора |

**Storage Bucket:** `feedback-attachments` (приватный)

### 3.2. Авторизация администратора

Использую существующую PIN-систему с расширением:

1. Новый секрет `ADMIN_PIN` (отличается от AI_ACCESS_PIN)
2. Отдельный токен `daybook-admin-token` с TTL 24 часа
3. Edge Function `admin-pin-verify` для верификации

### 3.3. Edge Functions

| Функция | Назначение |
|---------|------------|
| `feedback-submit` | Приём фидбека от пользователей |
| `admin-pin-verify` | Авторизация администратора |
| `admin-feedback-list` | Получение списка фидбеков |
| `admin-feedback-update` | Изменение статуса, добавление заметок |
| `admin-feedback-image` | Получение signed URL для изображений |

### 3.4. Страницы UI

**`/admin`** - Страница входа:
- PIN-код ввод (4-6 цифр)
- Стиль "кибер-гримуар"

**`/admin/feedback`** - Список фидбеков:
- Таблица/карточки с сообщениями
- Фильтры по статусу (new, read, resolved)
- Сортировка по дате
- Просмотр изображений в модале
- Изменение статуса
- Поле для заметок админа

## 4. Безопасность

| Мера | Реализация |
|------|------------|
| Авторизация | HMAC-токен с TTL 24ч, проверка на сервере |
| Изоляция | Отдельный PIN для админа (не AI_ACCESS_PIN) |
| RLS | Таблица feedback доступна только через Edge Functions |
| Storage | Приватный bucket, signed URLs с коротким TTL |
| Rate limiting | Ограничение попыток ввода PIN |

## 5. Пользовательский поток

```text
[Пользователь]                         [Администратор]
     |                                        |
     |-- Нажимает "Магическая почта" -------->|
     |-- Пишет сообщение + прикрепляет фото ->|
     |-- Нажимает "Отправить в эфир" -------->|
     |                                        |
     |                          [Edge Function]
     |                                |
     |                   +------------+------------+
     |                   |                         |
     |              [Сохранить          [Загрузить изображение
     |               в feedback]         в Storage bucket]
     |                   |                         |
     |                   +-----------+-------------+
     |                               |
     |                     [Записать image_url]
     |                               |
     |                               v
     |                        [База данных]
     |                               |
     |                               v
     |                   [Админ заходит на /admin]
     |                               |
     |                   [Вводит ADMIN_PIN]
     |                               |
     |                   [Видит список фидбеков]
     |                               |
     |                   [Читает, меняет статус,
     |                    добавляет заметки]
```

## 6. Этапы реализации

### Фаза 1: Инфраструктура (бэкенд)
1. Создать таблицу `feedback` с RLS
2. Создать Storage bucket `feedback-attachments`
3. Добавить секрет `ADMIN_PIN`
4. Создать Edge Function `feedback-submit`
5. Создать Edge Function `admin-pin-verify`

### Фаза 2: Отправка фидбека
6. Обновить `FeedbackModal` для отправки данных на сервер
7. Добавить индикатор загрузки и обработку ошибок
8. Ограничить размер изображения (макс. 5 МБ)

### Фаза 3: Админ-панель (UI)
9. Создать страницу `/admin` с PIN-авторизацией
10. Создать хук `useAdminAccess` (аналог useAIAccess)
11. Создать Edge Functions для чтения/обновления фидбека
12. Создать страницу `/admin/feedback` со списком
13. Добавить модальное окно просмотра изображений
14. Добавить управление статусом и заметками

### Фаза 4: Улучшения
15. Добавить уведомления (опционально: Telegram)
16. Добавить пагинацию для большого количества записей
17. Добавить экспорт в CSV

## 7. Технические детали

### 7.1. Структура файлов

```text
src/
├── pages/
│   ├── AdminLoginPage.tsx      # PIN-авторизация
│   └── AdminFeedbackPage.tsx   # Список фидбеков
├── components/admin/
│   ├── FeedbackCard.tsx        # Карточка фидбека
│   ├── FeedbackImageModal.tsx  # Просмотр изображений
│   └── AdminPinDialog.tsx      # Диалог ввода PIN
├── hooks/
│   └── useAdminAccess.ts       # Управление админ-токеном
└── lib/
    └── adminTokenService.ts    # Работа с токеном

supabase/functions/
├── feedback-submit/index.ts
├── admin-pin-verify/index.ts
├── admin-feedback-list/index.ts
└── admin-feedback-update/index.ts
```

### 7.2. Схема базы данных (SQL)

```sql
-- Enum для статуса
CREATE TYPE feedback_status AS ENUM ('new', 'read', 'resolved', 'archived');

-- Таблица фидбека
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  image_url TEXT,
  device_info JSONB DEFAULT '{}',
  status feedback_status DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: запретить прямой доступ
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
-- Нет политик = доступ только через service_role (Edge Functions)
```

### 7.3. Стек технологий

- **UI**: React + shadcn/ui (существующие компоненты)
- **Стейт**: TanStack React Query для кеширования
- **Авторизация**: HMAC-токены (аналог AI-доступа)
- **Хранилище**: Supabase Storage (приватный bucket)
- **API**: Supabase Edge Functions (Deno)

