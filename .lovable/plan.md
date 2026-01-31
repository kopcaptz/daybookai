# Техническое задание: Админ-панель для управления фидбеком

## Статус реализации

### ✅ Фаза 1: Инфраструктура (бэкенд) — ГОТОВО
1. ✅ Создана таблица `feedback` с RLS
2. ✅ Создан Storage bucket `feedback-attachments`
3. ✅ Добавлен секрет `ADMIN_PIN`
4. ✅ Создана Edge Function `feedback-submit`
5. ✅ Создана Edge Function `admin-pin-verify`

### ✅ Фаза 2: Отправка фидбека — ГОТОВО
6. ✅ Обновлён `FeedbackModal` для отправки данных на сервер
7. ✅ Добавлен индикатор загрузки и обработка ошибок
8. ✅ Ограничение размера изображения (макс. 5 МБ)

### ✅ Фаза 3: Админ-панель (UI) — ГОТОВО
9. ✅ Создана страница `/admin` с PIN-авторизацией
10. ✅ Создан хук `useAdminAccess`
11. ✅ Создана Edge Function `admin-feedback-list`
12. ✅ Создана Edge Function `admin-feedback-update`
13. ✅ Создана страница `/admin/feedback` со списком
14. ✅ Добавлено модальное окно просмотра изображений
15. ✅ Добавлено управление статусом и заметками

### ⏳ Фаза 4: Улучшения (опционально)
- [ ] Добавить уведомления (Telegram)
- [ ] Добавить пагинацию для большого количества записей
- [ ] Добавить экспорт в CSV

---

## Архитектура

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

## Структура файлов

```text
src/
├── pages/
│   ├── AdminLoginPage.tsx      # PIN-авторизация
│   └── AdminFeedbackPage.tsx   # Список фидбеков
├── components/admin/
│   ├── FeedbackCard.tsx        # Карточка фидбека
│   └── FeedbackImageModal.tsx  # Просмотр изображений
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

## Маршруты

- `/admin` — страница входа (PIN)
- `/admin/feedback` — список посланий

## Безопасность

- RLS включён, политик нет → доступ только через service_role
- HMAC-токены с TTL 24 часа для админов
- Отдельный ADMIN_PIN (не путать с AI_ACCESS_PIN)
- Signed URLs для изображений с TTL 1 час
