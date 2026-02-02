
# План исправления Ethereal Layer Messaging v6 (финальный)

## Обзор

Устранение 3 рисков + 3 улучшения для надёжной синхронизации сообщений. Включает аккуратную миграцию данных v1 → v2.

---

## Этап 1: etherealDb.ts — serverId как primary key + миграция

### Изменения в интерфейсе EtherealMessage

```text
- Убираем id?: number
- serverId: string — теперь PRIMARY KEY (обязательный)
- syncStatus: 'synced' | 'failed' (убрали 'pending')
```

### Добавляем stableMsgSort()

```text
function stableMsgSort(a, b):
  if (a.createdAtMs !== b.createdAtMs)
    return a.createdAtMs - b.createdAtMs
  return a.serverId.localeCompare(b.serverId)
```

### Миграция v1 → v2 (для существующих пользователей)

```text
version(2).stores({
  messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
  // остальные таблицы без изменений
}).upgrade(tx):
  1. Читаем все старые сообщения
  2. Дедуплицируем по serverId (берём свежее по createdAtMs)  
  3. Удаляем старое поле id из объектов
  4. clear() + bulkPut() с новой схемой
```

### Обновляем mergeMessages()

```text
- Использовать bulkPut вместо bulkAdd (upsert по serverId)
- Возвращать toArray().sort(stableMsgSort)
```

### Обновляем EntityTable typing

```text
messages!: EntityTable<EtherealMessage, 'serverId'>
```

---

## Этап 2: useEtherealRealtime.ts — 6 улучшений

### A) Guard от параллельных loadHistory()

```text
+ historyInFlightRef = useRef(false)
+ Early return если уже выполняется
```

### B) Мгновенный UI update в sendMessage()

```text
1. POST → получаем data.id, data.createdAtMs
2. Сразу setMessages([...prev, newMsg].sort(stableMsgSort))
3. etherealDb.messages.put(newMsg)
4. broadcast для других участников
```

### C) Reconcile при SUBSCRIBED

```text
subscribe():
  if (SUBSCRIBED):
    await loadHistory()  // reconcile при каждом переподключении
    await channel.track(...)
```

### D) Умный periodic reconcile (рекомендация A)

```text
+ useEffect с setInterval(45 сек)
+ Проверка document.visibilityState === 'visible'
+ Проверка channelRef.current существует
+ Экономит батарею на Android
```

### E) Слушаем member_kicked

```text
.on('broadcast', { event: 'member_kicked' }):
  if (payload.targetMemberId === memberId):
    clearEtherealSession()
    removeChannel()
    dispatchEvent('ethereal-kicked')
```

### F) Экспорт broadcastKick() и refresh

```text
broadcastKick(targetMemberId):
  channel.send({ event: 'member_kicked', payload: { targetMemberId } })

return { messages, onlineMembers, typingMembers, sendTyping, sendMessage, 
         broadcastKick, refresh: loadHistory, isConnected }
```

---

## Этап 3: EtherealMembersSheet.tsx — broadcast kick

### Изменения

```text
+ props: onKickSuccess?: (targetMemberId: string) => void

handleKick():
  после успешного DELETE:
    onKickSuccess?.(targetMemberId)
    loadMembers()
```

---

## Этап 4: EtherealChat.tsx — обработка событий

### Добавляем event listeners

```text
useEffect():
  handleKicked:
    toast.error('Вас удалили из комнаты')
    navigate('/')
    
  handleExpired:
    toast.error('Сессия истекла')  
    navigate('/')
  
  addEventListener('ethereal-kicked', handleKicked)
  addEventListener('ethereal-session-expired', handleExpired)
```

---

## Чеклист файлов

| Файл | Изменения |
|------|-----------|
| `src/lib/etherealDb.ts` | serverId=PK, v2 миграция с upgrade, stableMsgSort, mergeMessages с bulkPut |
| `src/hooks/useEtherealRealtime.ts` | historyInFlightRef, instant UI, reconcile on SUBSCRIBED, smart periodic reconcile, member_kicked, broadcastKick, refresh |
| `src/components/ethereal/EtherealMembersSheet.tsx` | onKickSuccess callback prop |
| `src/pages/ethereal/EtherealChat.tsx` | kicked/expired event handlers с toast + navigate |

---

## Ожидаемый результат

| Проблема | Решение |
|----------|---------|
| Дубли в IndexedDB | Upsert по serverId (primary key) |
| UI-лаг после отправки | Instant state update до broadcast |
| Пропущенные сообщения | Reconcile при SUBSCRIBED + каждые 45 сек |
| Kick UX | Мгновенный через broadcast member_kicked |
| Нестабильный порядок | Tie-breaker по serverId |
| Параллельные loadHistory | Guard с historyInFlightRef |
| Батарея Android | Visibility API для periodic reconcile |
| Миграция данных | Аккуратный upgrade v1→v2 с дедупликацией |
