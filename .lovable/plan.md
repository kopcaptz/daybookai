
# План: Финальный upgrade-блок v2

## Обзор
Применить рекомендованный upgrade-блок с 3 улучшениями для надёжной миграции данных.

---

## Изменения в `src/lib/etherealDb.ts`

### Строки 118-144: Заменить upgrade-блок

**Было:**
```typescript
.upgrade(async (tx) => {
  const oldMessages = await tx.table('messages').toArray();

  const byServerId = new Map<string, any>();
  for (const msg of oldMessages) {
    if (!msg.serverId) continue; // skip invalid entries

    const existing = byServerId.get(msg.serverId);
    if (!existing || (msg.createdAtMs ?? 0) > (existing.createdAtMs ?? 0)) {
      const { id, ...rest } = msg;
      byServerId.set(msg.serverId, {
        ...rest,
        syncStatus: rest.syncStatus === 'pending' ? 'synced' : rest.syncStatus,
      });
    }
  }

  await tx.table('messages').clear();
  const deduplicated = [...byServerId.values()];
  if (deduplicated.length > 0) {
    await tx.table('messages').bulkPut(deduplicated);
  }
});
```

**Станет:**
```typescript
.upgrade(async (tx) => {
  const oldMessages = await tx.table('messages').toArray();

  // Safe timestamp parsing
  const safeParseMs = (v: any): number => {
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  // Normalize timestamps from various formats
  const getTimestamp = (m: any): number => {
    if (typeof m.createdAtMs === 'number') return m.createdAtMs;
    if (m.createdAt) return safeParseMs(m.createdAt);
    if (m.created_at) return safeParseMs(m.created_at);
    return 0;
  };

  const byServerId = new Map<string, any>();

  for (let i = 0; i < oldMessages.length; i++) {
    const msg: any = oldMessages[i];

    // 1) Legacy serverId (deterministic) - preserve messages without serverId
    const legacyIdPart = msg.id ?? i;
    const serverId = msg.serverId || `legacy-${legacyIdPart}`;

    // 2) Normalize time once
    const msgTime = getTimestamp(msg);

    const existing = byServerId.get(serverId);
    const existingTime = existing ? (existing.createdAtMs ?? getTimestamp(existing)) : 0;

    // Keep newest
    if (!existing || msgTime > existingTime) {
      const { id, ...rest } = msg;

      byServerId.set(serverId, {
        ...rest,
        serverId,
        createdAtMs: msgTime,
        // 3) syncStatus default - never undefined
        syncStatus: rest.syncStatus === 'failed' ? 'failed' : 'synced',
      });
    }
  }

  await tx.table('messages').clear();

  const deduplicated = [...byServerId.values()];
  if (deduplicated.length > 0) {
    await tx.table('messages').bulkPut(deduplicated);
  }
});
```

---

## Улучшения

| Проблема | Решение |
|----------|---------|
| Потеря сообщений без serverId | `legacy-${id}` — детерминированный, стабильный ID |
| Некорректный дедуп по времени | `safeParseMs()` + `getTimestamp()` для createdAt/created_at |
| undefined syncStatus | Дефолт `'synced'`, сохраняем только `'failed'` |
| Потеря normalized времени | Записываем `createdAtMs: msgTime` в результат |

---

## Чеклист

| Файл | Изменение |
|------|-----------|
| `src/lib/etherealDb.ts` | Финальный upgrade-блок с 3 фиксами |

---

## Подтверждения после внедрения

1. ✅ `EtherealMessage.serverId` — уже обязательный (строка 5)
2. ✅ `EntityTable<EtherealMessage, 'serverId'>` — уже есть (строка 88)  
3. ✅ `mergeMessages()` — тип `Promise<EtherealMessage[]>` уже корректный (строка 160)
