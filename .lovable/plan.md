
# План: Диагностические логи для тестирования Ethereal

## Обзор
Добавить 4 ключевых console.log в `useEtherealRealtime.ts` для мгновенной диагностики проблем в цепочке: POST → Dexie → Broadcast → Reconcile.

---

## Изменения в `src/hooks/useEtherealRealtime.ts`

### 1. Лог при loadHistory() (строки 45-61)

**Добавить:**
```typescript
// строка 45, после try {
console.log('[RT] history:start');

// строка 58, внутри if (data.success...)
console.log('[RT] history:end', { count: data.messages.length });
```

### 2. Лог при SUBSCRIBED (строка 137-140)

**Добавить:**
```typescript
// строка 137, после if (status === 'SUBSCRIBED')
console.log('[RT] connected + reconcile');
```

### 3. Лог при sendMessage() (строки 208-242)

**Добавить:**
```typescript
// строка 209, после if (!data.success) return data;
console.log('[RT] POST ok', { id: data.id, ts: data.createdAtMs });

// строка 242, после channelRef.current?.send(...)
console.log('[RT] broadcast:sent', { serverId: newMsg.serverId });
```

### 4. Лог при получении broadcast (строки 83-104)

**Добавить:**
```typescript
// строка 84, после if (!payload?.serverId) return;
console.log('[RT] broadcast:received', { 
  serverId: payload.serverId, 
  ts: payload.createdAtMs 
});
```

---

## Полный список точек логирования

| Точка | Лог | Что показывает |
|-------|-----|----------------|
| SUBSCRIBED | `[RT] connected + reconcile` | Канал подключен, начинается reconcile |
| loadHistory start | `[RT] history:start` | Запрос истории начался |
| loadHistory end | `[RT] history:end {count}` | Сколько сообщений получено |
| sendMessage POST | `[RT] POST ok {id, ts}` | Сервер принял сообщение |
| sendMessage broadcast | `[RT] broadcast:sent {serverId}` | Отправлен broadcast другим |
| broadcast handler | `[RT] broadcast:received {serverId, ts}` | Получен broadcast от другого |

---

## Как использовать при тестировании

### Сценарий "Отправка сообщений":
```
Ожидаемая последовательность в консоли:
[RT] POST ok {id: "uuid", ts: 1234567890}
[RT] broadcast:sent {serverId: "uuid"}
```

### Сценарий "Reconnect":
```
Ожидаемая последовательность:
[RT] connected + reconcile
[RT] history:start
[RT] history:end {count: 50}
```

### Сценарий "Получение от другого устройства":
```
[RT] broadcast:received {serverId: "uuid", ts: 1234567890}
```

---

## Быстрая диагностика по логам

| Проблема | Что видим | Где баг |
|----------|-----------|---------|
| Сообщение не отправилось | Нет `POST ok` | Сеть или Edge Function |
| Сообщение отправилось, но не broadcast | Есть `POST ok`, нет `broadcast:sent` | `channelRef.current` = null |
| Другой не получил | У отправителя `broadcast:sent`, у получателя нет `received` | Realtime канал / channelKey |
| После reconnect пусто | `connected + reconcile`, но `history:end {count: 0}` | Edge Function GET или токен |

---

## Чеклист

| Файл | Изменение |
|------|-----------|
| `src/hooks/useEtherealRealtime.ts` | +6 console.log в ключевых точках |

---

## После тестирования

Когда тесты пройдены — можно:
1. Удалить логи (или оставить с флагом `DEBUG`)
2. Перейти к реализации Edge Function для календаря
