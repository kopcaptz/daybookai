

# Исправление ошибки Dexie: изменение primary key таблицы tasks

## Проблема

При попытке открыть страницу "Мостик" (Tasks) возникает ошибка:
```
DatabaseClosedError: UpgradeError Not yet support for changing primary key
```

**Причина:** В Dexie нельзя изменить primary key существующей таблицы. Схема v5 пытается изменить `tasks` с `++id` (auto-increment) на `serverId`, что невозможно.

## Решение

Использовать специальный паттерн Dexie для пересоздания таблицы:
1. В промежуточной версии (v5.1) установить `tasks: null` для удаления таблицы
2. В следующей версии (v6) создать новую таблицу с правильной схемой

## Технические изменения

### Файл: `src/lib/etherealDb.ts`

Заменить версию 5 на две версии:

```typescript
// v5 - DELETE old tasks table (required to change primary key)
this.version(5).stores({
  messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
  chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]',
  tasks: null,  // <-- УДАЛИТЬ таблицу
  events: '++id, serverId, roomId, startAtMs',
  members: 'id, roomId, joinedAtMs',
  settings: 'key',
});

// v6 - CREATE new tasks table with serverId as primary key
this.version(6).stores({
  messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
  chronicles: 'serverId, roomId, updatedAtMs, pinned, [roomId+updatedAtMs]',
  tasks: 'serverId, roomId, status, dueAtMs, updatedAtMs, [roomId+status]',
  events: '++id, serverId, roomId, startAtMs',
  members: 'id, roomId, joinedAtMs',
  settings: 'key',
});
```

## Последствия

- Все локальные задачи будут удалены (но их и так не было в production)
- После перезагрузки страницы задачи загрузятся с сервера
- Функционал будет работать корректно

## План выполнения

| Шаг | Задача |
|-----|--------|
| 1 | Изменить схему Dexie: v5 удаляет tasks, v6 создаёт с новым PK |
| 2 | Протестировать загрузку страницы Tasks |
| 3 | Создать тестовую задачу |
| 4 | Проверить toggle, редактирование, удаление |

