
# План: Игровой модуль «Ситуации на борту»

## Обзор

Реализация интерактивной игры для двух игроков в разделе «Игровой зал» (/e/games). Игра использует ИИ для генерации жизненных ситуаций и анализа ответов партнёров, работает в реальном времени через существующую broadcast-архитектуру.

---

## Архитектура

### Игровой цикл (Finite State Machine)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GAME SESSION FSM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────┐      start      ┌────────────────┐                        │
│   │   LOBBY    │ ──────────────> │  PICKER_TURN   │                        │
│   │ (ждём 2+)  │                 │ (выбор ситуации)│                        │
│   └────────────┘                 └───────┬────────┘                        │
│         ^                                │ pick                            │
│         │                                v                                 │
│    end_game                      ┌────────────────┐                        │
│         │                        │ RESPONDER_TURN │                        │
│         │                        │ (ответ партнёра)│                        │
│         │                        └───────┬────────┘                        │
│         │                                │ respond                         │
│         │                                v                                 │
│         │                        ┌────────────────┐                        │
│         │                        │   REFLECTION   │                        │
│         │<─────── skip_ai ───────│  (опц. разбор) │                        │
│         │                        └───────┬────────┘                        │
│         │                                │ reveal / next                   │
│         │                                v                                 │
│         └─────── end ────────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Структура данных

**Таблица: `ethereal_game_sessions`**

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | uuid | PK |
| room_id | uuid | FK → ethereal_rooms |
| game_type | text | 'situations' |
| status | text | 'lobby' / 'active' / 'completed' |
| current_round | int | 1-based |
| picker_id | uuid | FK → ethereal_room_members (кто выбирает) |
| responder_id | uuid | FK → ethereal_room_members (кто отвечает) |
| adult_mode | boolean | Режим 18+ |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Таблица: `ethereal_game_rounds`**

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | uuid | PK |
| session_id | uuid | FK → ethereal_game_sessions |
| round_number | int | |
| category | text | 'budget' / 'boundaries' / 'lifestyle' / ... |
| situation_text | text | Сгенерированная ИИ ситуация |
| options | jsonb | [{ id, text }] — варианты A/B/C |
| picker_answer | text | Что выбрал picker (для сравнения) |
| responder_answer | text | A/B/C/custom |
| responder_custom | text | Свой вариант, если выбран |
| values_questions | jsonb | [{q, a}] — уточняющие вопросы |
| ai_reflection | text | ИИ-разбор (опционально) |
| picker_revealed | boolean | Показал ли picker свой ответ |
| created_at | timestamptz | |

---

## Компоненты UI

### Иерархия страниц

```text
/e/games
├── EtherealGames.tsx (лобби / список игр)
│
└── /e/games/situations/:sessionId
    └── SituationsGame.tsx
        ├── GameLobby.tsx        (ожидание игроков)
        ├── PickerView.tsx       (выбор ситуации)
        ├── ResponderView.tsx    (карточка + ответ)
        └── ReflectionView.tsx   (разбор + reveal)
```

### Визуальный стиль

Карточки ситуаций стилизованы как «бортовые записки»:
- Фон: кремовая бумага (`#f5f0e8`)
- Рамка: латунный border
- Шрифт: serif для заголовков
- Варианты ответа: кнопки с иконками A/B/C

---

## Realtime-синхронизация

Расширяем существующий broadcast-канал:

```typescript
// Новые события в useEtherealRealtime
.on('broadcast', { event: 'game_update' }, ({ payload }) => {
  // payload: { sessionId, action, data }
  // actions: 'started', 'round_started', 'picked', 'responded', 'revealed'
})
```

Игрок-инициатор отправляет события, другие получают через broadcast.

---

## Edge Function: `ethereal_games`

Методы:
- `POST /create` — создать сессию
- `POST /join/:id` — присоединиться
- `POST /start/:id` — начать игру
- `POST /generate-situations` — запрос к ИИ (3 ситуации по категории)
- `POST /pick/:id` — выбор ситуации picker'ом
- `POST /respond/:id` — ответ responder'а
- `POST /reveal/:id` — показать ответ picker'а
- `POST /ai-reflect/:id` — запросить ИИ-разбор
- `POST /next-round/:id` — следующий раунд (смена ролей)
- `POST /end/:id` — завершить игру

---

## ИИ-интеграция

### Генерация ситуаций

Используем Lovable AI Gateway (google/gemini-2.5-flash):

```typescript
const systemPrompt = `
Ты — ведущий игры "Ситуации на борту" для пар.
Генерируй 3 реалистичные бытовые ситуации для категории "${category}".
${adultMode ? 'Режим 18+: можно включать интимные темы.' : 'Режим SFW: избегай интимных тем.'}

Формат JSON:
{
  "situations": [
    {
      "id": "sit_1",
      "text": "Описание ситуации...",
      "options": [
        { "id": "A", "text": "Вариант A..." },
        { "id": "B", "text": "Вариант B..." },
        { "id": "C", "text": "Вариант C..." }
      ],
      "valuesQuestion": "Уточняющий вопрос о ценностях..."
    }
  ]
}
`;
```

### ИИ-рефлексия

```typescript
const reflectionPrompt = `
Партнёр 1 выбрал: ${pickerAnswer}
Партнёр 2 ответил: ${responderAnswer}

Дай мягкую, конструктивную обратную связь (2-3 предложения).
Фокусируйся на понимании и сближении, НЕ на оценке "правильности".
`;
```

---

## Категории ситуаций

| Категория | Описание | 18+ |
|-----------|----------|-----|
| budget | Финансы, покупки, сбережения | Нет |
| boundaries | Личные границы, время для себя | Нет |
| lifestyle | Быт, уборка, распорядок | Нет |
| social | Друзья, семья, гости | Нет |
| travel | Путешествия, отпуск | Нет |
| intimacy | Интимная жизнь | Да |
| fantasies | Желания, фантазии | Да |

---

## Безопасность

1. **Ethereal Token** — все запросы через существующую валидацию
2. **Room Scope** — игра ограничена участниками комнаты
3. **Тон** — системный промпт запрещает конфликтные/манипулятивные формулировки
4. **18+ Gate** — взрослые категории требуют явного включения режима обоими игроками

---

## Фаза 1: MVP (Этот план)

1. Создать таблицы `ethereal_game_sessions` и `ethereal_game_rounds`
2. Создать Edge Function `ethereal_games`
3. Обновить `EtherealGames.tsx` — лобби с кнопкой "Создать игру"
4. Создать `SituationsGame.tsx` — основной компонент игры
5. Добавить broadcast события в `useEtherealRealtime`
6. Интеграция с ИИ для генерации ситуаций

## Фаза 2: Улучшения

- История сыгранных игр
- Статистика совпадений
- Кастомные категории
- Режим "Быстрая игра" (1 раунд)

---

## Изменяемые файлы

| Файл | Действие |
|------|----------|
| **База данных** | Миграция: 2 новые таблицы |
| `supabase/functions/ethereal_games/index.ts` | Создать Edge Function |
| `src/pages/ethereal/EtherealGames.tsx` | Редизайн в лобби |
| `src/pages/ethereal/SituationsGame.tsx` | Новый: основная страница игры |
| `src/components/games/GameLobby.tsx` | Новый: ожидание игроков |
| `src/components/games/PickerView.tsx` | Новый: выбор ситуации |
| `src/components/games/ResponderView.tsx` | Новый: ответ на ситуацию |
| `src/components/games/ReflectionView.tsx` | Новый: рефлексия + reveal |
| `src/components/games/SituationCard.tsx` | Новый: стилизованная карточка |
| `src/hooks/useEtherealRealtime.ts` | Добавить game_update события |
| `src/lib/etherealDb.ts` | Добавить таблицы для локального кэша |
| `src/App.tsx` | Добавить route `/e/games/situations/:id` |

---

## Результат

Интерактивная игра для двоих, интегрированная в яхтенную эстетику «Эфирного слоя». Пользователи могут:
- Создавать игровые сессии
- Выбирать категории и режим (SFW/18+)
- Обмениваться ситуациями в реальном времени
- Получать мягкую ИИ-обратную связь о совместимости взглядов
- Сохранять историю раундов для рефлексии
