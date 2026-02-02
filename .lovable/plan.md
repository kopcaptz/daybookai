

# Библиотека (Хроники) v1.0 — Исправленный план

## Текущее состояние

Таблица `ethereal_chronicles` уже существует с базовыми полями:
- `id`, `room_id`, `author_id`, `title`, `content`, `created_at`, `updated_at`
- RLS "Deny all direct access" ✅ уже включён

UI: заглушка "Скоро откроется" в `EtherealChronicles.tsx`

---

## Фаза A: CRUD (правильный MVP)

### A.1 Миграция БД

```sql
-- Расширить ethereal_chronicles
ALTER TABLE public.ethereal_chronicles
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_by uuid,
  ADD COLUMN editing_by uuid,
  ADD COLUMN editing_expires_at timestamptz,
  ADD COLUMN media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Таблица ревизий
CREATE TABLE public.ethereal_chronicle_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chronicle_id uuid NOT NULL REFERENCES ethereal_chronicles(id) ON DELETE CASCADE,
  editor_id uuid NOT NULL,
  title_snapshot text NOT NULL,
  content_snapshot text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS для ревизий
ALTER TABLE public.ethereal_chronicle_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct access" ON public.ethereal_chronicle_revisions
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- Индексы
CREATE INDEX idx_chronicles_room_pinned ON ethereal_chronicles(room_id, pinned DESC, updated_at DESC);
CREATE INDEX idx_chronicle_revisions_chronicle ON ethereal_chronicle_revisions(chronicle_id, created_at DESC);
```

### A.2 Обновление Dexie (v4)

```typescript
// Primary key = serverId (как у messages)
interface EtherealChronicle {
  serverId: string;  // PRIMARY KEY
  roomId: string;
  authorId: string;
  authorName: string;
  updatedById?: string;
  updatedByName?: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  media: Array<{path: string; mime: string; w?: number; h?: number; kind: 'image'|'audio'}>;
  editingBy?: string;
  editingExpiresAt?: number;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Schema v4
chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]'
```

### A.3 Edge Function `ethereal_chronicles`

Эндпоинты с тем же паттерном токена X-Ethereal-Token:

| Метод | Путь | Действие |
|-------|------|----------|
| `GET` | `/?limit=50&before=timestamp` | Список хроник комнаты |
| `GET` | `/:id` | Одна хроника |
| `POST` | `/` | Создать запись |
| `PUT` | `/:id` | Обновить (создаёт revision) |
| `POST` | `/:id/pin` | Toggle pinned |
| `POST` | `/:id/lock` | Взять в редактирование |
| `POST` | `/:id/unlock` | Освободить (только owner) |

Формат ответа:
```json
{
  "serverId": "uuid",
  "roomId": "uuid",
  "title": "...",
  "content": "...",
  "tags": ["tag1", "tag2"],
  "pinned": false,
  "media": [{"path": "...", "signedUrl": "...", "mime": "image/jpeg"}],
  "authorName": "...",
  "updatedByName": "...",
  "createdAtMs": 1234567890,
  "updatedAtMs": 1234567890,
  "editingBy": null,
  "editingExpiresAt": null
}
```

### A.4 UI компоненты

| Файл | Описание |
|------|----------|
| `ChroniclesList.tsx` | Список + поиск + секция "📌 Закреплённые" |
| `ChronicleCard.tsx` | Карточка: заголовок, превью, теги, автор |
| `ChronicleView.tsx` | Просмотр на "пергаменте" |
| `ChronicleEditor.tsx` | Редактирование: title + textarea |

Сортировка в списке:
1. `pinned DESC`
2. `updatedAt DESC`

---

## Фаза B: Lock + Revisions

### B.1 Lock контракт (ownership)

Lock выдаётся если:
- `editing_by IS NULL` или
- `editing_expires_at < now()` (протух) или
- `editing_by = текущий memberId` (продление)

Unlock только если:
- `editing_by = текущий memberId` или
- `editing_expires_at < now()`

Lock refresh:
- Клиент каждые 30 сек → `POST /:id/lock`
- Если сервер вернул `locked_by_other` → режим read-only
- Timeout: 2 минуты без активности → auto-unlock

UI:
- Баннер "X редактирует, осталось ~NN сек"
- Кнопка "Открыть только чтение"

### B.2 Ревизии

При `PUT /:id`:
1. Сохранить snapshot текущего `title` + `content` в `revisions`
2. Обновить запись
3. Снять lock

UI "История" (опционально, можно отложить):
- Список версий с датой и автором
- Кнопка "Откатить"

---

## Фаза C: Медиа

### C.1 Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('ethereal-chronicles-media', 'ethereal-chronicles-media', false);
```

Пути: `{roomId}/chronicle-{chronicleId}/img-{uuid}.jpg`

### C.2 Upload endpoint

Отдельный эндпоинт `POST /:id/media`:
- FormData с image/audio
- Загрузка в bucket
- Добавление в `media[]` хроники
- Возврат `{path, signedUrl, mime}`

### C.3 Хранение в контенте (stable path!)

В `content` вставляем плейсхолдер:
```
[[img:roomId/chronicle-xxx/img-uuid.jpg]]
```

При GET сервер:
1. Пробегает по `media[]`
2. Генерирует `signedUrl` для каждого (30 мин TTL)
3. Возвращает в ответе

Клиент при render:
- Заменяет `[[img:path]]` на `<img src={signedUrl}>`

Так URLs всегда свежие, а контент стабильный.

---

## Фаза D: AI-помощник

### D.1 Edge Function `ethereal_chronicles_ai`

| Эндпоинт | Действие |
|----------|----------|
| `/polish` | Полировка стиля (без добавления фактов) |
| `/tags` | Предложить теги + настроение |
| `/summary` | Сводка за N дней (Captain's log) |
| `/questions` | 3-5 вопросов по записи |

### D.2 Модель и Safe Mode

Модель: `google/gemini-2.5-flash`

Системный промпт:
```
Ты — бережный архивариус команды яхты.
Правила:
1. Никаких догадок — если не написано, не придумывай
2. Никаких личных данных извне
3. Интимный/личный контент — бережно, без морализаторства
4. Стиль: тёплый, лаконичный, уважительный
```

AI получает только текст записи (без медиа).

---

## Структура файлов

```text
src/
├── pages/ethereal/
│   └── EtherealChronicles.tsx    (рефакторинг)
├── components/ethereal/
│   ├── ChroniclesList.tsx        (новый)
│   ├── ChronicleCard.tsx         (новый)
│   ├── ChronicleView.tsx         (новый)
│   ├── ChronicleEditor.tsx       (новый)
│   └── ChronicleAISheet.tsx      (Фаза D)
├── hooks/
│   └── useEtherealChronicles.ts  (новый)
└── lib/
    └── etherealDb.ts             (v4 upgrade)

supabase/
├── functions/
│   ├── ethereal_chronicles/      (новый)
│   └── ethereal_chronicles_ai/   (Фаза D)
└── config.toml                   (добавить функции)
```

---

## План выполнения

| Фаза | Что делаем | Приоритет |
|------|-----------|-----------|
| **A** | Миграция + Edge Function + UI (список/просмотр/редактирование) | 🔴 Высокий |
| **B** | Lock editing + Ревизии | 🟡 Средний |
| **C** | Bucket + Загрузка изображений | 🟡 Средний |
| **D** | AI-помощник | 🟢 Низкий |

---

## Ключевые правки учтены

| Правка | Реализация |
|--------|------------|
| ✅ `tags text[]` вместо jsonb | Используем `text[] NOT NULL DEFAULT '{}'::text[]` |
| ✅ RLS уже есть | Проверил: "Deny all direct access" уже включён |
| ✅ Stable path для медиа | Храним `[[img:path]]`, не signedUrl |
| ✅ Lock ownership | Только owner может продлевать/снимать |
| ✅ Dexie serverId | Primary key = serverId, убран `id?: number` |

