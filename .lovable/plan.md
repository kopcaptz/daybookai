

# Капитанский мостик (Задачи) v1.0

## Текущее состояние

**База данных `ethereal_tasks`:**
- `id`, `room_id`, `creator_id`, `assignee_id`, `title`, `description`
- `status` (default: 'todo'), `due_at`, `created_at`, `updated_at`
- RLS "Deny all direct access" уже включён

**Dexie:** Схема v4, задачи с `++id` (auto-increment) — нужно обновить на `serverId` как primary key

**UI:** Заглушка "Скоро откроется" в `EtherealTasks.tsx`

---

## Фаза A: Базовый CRUD

### A.1 Миграция БД

Добавить недостающие поля:

```sql
ALTER TABLE public.ethereal_tasks
  ADD COLUMN priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'urgent')),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completed_by uuid;

-- Индексы для частых запросов
CREATE INDEX IF NOT EXISTS idx_tasks_room_updated 
  ON ethereal_tasks(room_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_room_status_due 
  ON ethereal_tasks(room_id, status, due_at);
```

### A.2 Обновление Dexie (v5)

```typescript
interface EtherealTask {
  serverId: string;       // PRIMARY KEY (как messages/chronicles)
  roomId: string;
  creatorId: string;
  creatorName: string;
  assigneeId?: string;
  assigneeName?: string;
  title: string;
  description?: string;
  status: 'todo' | 'done';          // v1.0: только 2 статуса
  priority: 'normal' | 'urgent';
  dueAtMs?: number;
  completedAtMs?: number;
  completedByName?: string;
  createdAtMs: number;
  updatedAtMs: number;
  syncStatus: 'pending' | 'synced';
}

// Schema v5
tasks: 'serverId, roomId, status, dueAtMs, updatedAtMs, [roomId+status]'
```

### A.3 Edge Function `ethereal_tasks`

| Метод | Путь | Действие |
|-------|------|----------|
| `GET` | `/` | Список задач комнаты |
| `POST` | `/` | Создать задачу |
| `PUT` | `/:id` | Обновить задачу |
| `POST` | `/:id/toggle` | done <-> todo |
| `DELETE` | `/:id` | Удалить задачу |

**Особенности:**
- Тот же паттерн токена `X-Ethereal-Token`
- GET: `?includeDone=false&limit=80`
- JOIN с `ethereal_room_members` для `creatorName` / `assigneeName`
- Toggle: ставит `completed_at` + `completed_by` при done

**Формат ответа:**

```json
{
  "serverId": "uuid",
  "roomId": "uuid",
  "title": "Купить продукты",
  "description": null,
  "status": "todo",
  "priority": "normal",
  "dueAtMs": 1770100000000,
  "creatorName": "Макс",
  "assigneeName": "Анна",
  "createdAtMs": 1770000000000,
  "updatedAtMs": 1770000000000
}
```

### A.4 UI компоненты

| Файл | Описание |
|------|----------|
| `TasksList.tsx` | Список с группами (urgent/active/done) |
| `TaskCard.tsx` | Карточка: чекбокс + заголовок + мета |
| `TaskEditor.tsx` | Sheet создания/редактирования |
| `TaskDetail.tsx` | Полный просмотр + редактирование |

**Группировка в списке:**
1. **Срочные** — `priority='urgent'` ИЛИ `due_at < now()+24h`
2. **Активные** — `status='todo'`
3. **Выполнено** — `status='done'` (свёрнуто по умолчанию)

**Сортировка внутри групп:** `updatedAt DESC`

---

## Фаза B: Realtime через Broadcast

### B.1 Паттерн (как в чате)

После успешной операции (create/update/toggle/delete):
1. Edge Function возвращает результат
2. Клиент обновляет UI + Dexie
3. Клиент делает `broadcast` через канал:
   - `task_upsert` — создание/обновление
   - `task_delete` — удаление

### B.2 Hook `useEtherealTasks`

```typescript
// Подписка на broadcast
channel.on('broadcast', { event: 'task_upsert' }, async ({ payload }) => {
  // Dedup через seenTaskEventsRef
  // Обновить Dexie + UI
});

channel.on('broadcast', { event: 'task_delete' }, ({ payload }) => {
  // Удалить из Dexie + UI
});
```

### B.3 Интеграция с существующим каналом

Использовать тот же канал `ethereal:${channelKey}` что и для сообщений — добавить события `task_*`.

---

## Фаза C: UX-детали

### C.1 Quick Complete

Тап на чекбокс → мгновенный toggle с анимацией

### C.2 Swipe-to-Delete

Свайп влево → красная зона "Удалить"
После удаления — toast "Задача удалена" с кнопкой "Отмена" (10 сек undo)

### C.3 Empty State

"Море спокойно. Дел на мостике нет." + иконка якоря

### C.4 Urgent Badge

Метка "На мостике!" для срочных задач

---

## Структура файлов

```text
src/
├── pages/ethereal/
│   └── EtherealTasks.tsx           (рефакторинг)
├── components/ethereal/
│   ├── TasksList.tsx               (новый)
│   ├── TaskCard.tsx                (новый)
│   ├── TaskEditor.tsx              (новый)
│   └── TaskDetail.tsx              (новый)
├── hooks/
│   ├── useEtherealRealtime.ts      (добавить task events)
│   └── useEtherealTasks.ts         (новый)
└── lib/
    └── etherealDb.ts               (v5 upgrade)

supabase/functions/
└── ethereal_tasks/                 (новый)
    └── index.ts
```

---

## План выполнения

| Шаг | Задачи |
|-----|--------|
| 1 | Миграция БД: добавить `priority`, `completed_at`, `completed_by` |
| 2 | Обновить Dexie до v5 с `EtherealTask` на `serverId` primary key |
| 3 | Создать Edge Function `ethereal_tasks` с CRUD + toggle |
| 4 | Создать hook `useEtherealTasks` |
| 5 | UI: `TasksList`, `TaskCard`, `TaskEditor` |
| 6 | Интегрировать broadcast в `useEtherealRealtime` |
| 7 | UI: swipe-to-delete, empty state, quick complete |

---

## Ключевые решения (из правок)

| Вопрос | Решение v1.0 |
|--------|--------------|
| Статусы | `todo` / `done` (без `in_progress`) |
| Приоритеты | `normal` / `urgent` (2 уровня) |
| Права | Любой может toggle/assign/delete |
| Realtime | Broadcast (не postgres changes) |
| Архивация | Хранить вечно, UI скрывает done |

---

## Безопасность

1. **RLS "Deny all"** — уже включён для `ethereal_tasks`
2. **Token validation** — тот же паттерн `X-Ethereal-Token`
3. **Room scope** — задачи видны только участникам комнаты
4. **Names через JOIN** — не хранить имена в задаче

