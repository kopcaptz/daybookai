
# План: Усиление надёжности Ethereal Photo Upload

## Обзор

Два критических улучшения для повышения надёжности реализации отправки фото:
1. **Edge Function**: "мягкий rollback" при ошибке update() с fallback на `[image upload failed]`
2. **useEtherealRealtime**: вынести Dexie put из setState + добавить in-memory dedup guard

---

## 1. Edge Function: updateError + мягкий rollback

### Текущая проблема (строки 211-218)

```typescript
// Сейчас — без проверки ошибки:
await supabase
  .from("ethereal_messages")
  .update({ image_path: imagePath, image_mime: imageFile.type })
  .eq("id", msg.id);
```

Если update упадёт:
- Файл уже в storage
- `image_path` не записался в БД
- Orphan file (файл без ссылки)

### Исправление

Добавить проверку `updateError` с каскадным cleanup:
1. Удалить файл (best effort)
2. Попытаться удалить сообщение
3. Если delete не удался → обновить content на `[image upload failed]`

```typescript
// После строки 218:
const { error: updateError } = await supabase
  .from("ethereal_messages")
  .update({
    image_path: imagePath,
    image_mime: imageFile.type,
  })
  .eq("id", msg.id);

if (updateError) {
  console.error("Update error:", updateError);
  
  // 1) Try remove file (best effort)
  try {
    await supabase.storage.from("ethereal-media").remove([imagePath]);
  } catch (e) {
    console.error("Cleanup remove file failed:", e);
  }
  
  // 2) Try delete message (best effort)
  const { error: delErr } = await supabase
    .from("ethereal_messages")
    .delete()
    .eq("id", msg.id);
  
  if (delErr) {
    console.error("Cleanup delete msg failed:", delErr);
    // 3) Fallback: mark message as failed so UI doesn't show ghost
    await supabase
      .from("ethereal_messages")
      .update({ content: "[image upload failed]" })
      .eq("id", msg.id);
  }
  
  return new Response(
    JSON.stringify({ success: false, error: "update_error" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Результат**: даже при двойных сбоях система "самозаживляется"

---

## 2. useEtherealRealtime: вынести put из setState + dedup guard

### Текущая проблема (строки 85-109)

```typescript
.on('broadcast', { event: 'message' }, ({ payload }) => {
  // ...
  setMessages((prev) => {
    // ...
    etherealDb.messages.put(newMsg); // ← async side-effect внутри setState!
    return [...prev, newMsg].sort(stableMsgSort);
  });
})
```

- React Strict Mode может вызвать callback дважды → двойной `put()`
- Редкие дубли broadcast тоже вызовут лишние операции

### Исправление

1. Добавить `seenBroadcastRef` для in-memory dedup
2. Вынести `etherealDb.messages.put()` из setState callback

```typescript
// Новый ref (после строки 32):
const seenBroadcastRef = useRef(new Set<string>());

// Обновлённый handler (строки 85-109):
.on('broadcast', { event: 'message' }, async ({ payload }) => {
  if (!payload?.serverId) return;
  
  // In-memory dedup guard
  if (seenBroadcastRef.current.has(payload.serverId)) return;
  seenBroadcastRef.current.add(payload.serverId);
  
  console.log('[RT] broadcast:received', { serverId: payload.serverId, ts: payload.createdAtMs });

  const newMsg: EtherealMessage = {
    serverId: payload.serverId,
    roomId: session.roomId,
    senderId: payload.senderId,
    senderName: payload.senderName,
    content: payload.content,
    createdAtMs: payload.createdAtMs,
    syncStatus: 'synced',
    imagePath: payload.imagePath,
    imageUrl: payload.imageUrl,
  };

  // 1) Update UI (pure computation only)
  setMessages((prev) => {
    if (prev.some((m) => m.serverId === payload.serverId)) return prev;
    return [...prev, newMsg].sort(stableMsgSort);
  });

  // 2) Persist to Dexie (outside setState)
  await etherealDb.messages.put(newMsg);

  // 3) Prevent Set from growing infinitely
  if (seenBroadcastRef.current.size > 2000) {
    seenBroadcastRef.current.clear();
  }
})
```

**Результат**:
- `setMessages` — чистая функция (только вычисление)
- `put()` вызывается один раз
- Защита от двойных broadcast в dev и production

---

## Изменяемые файлы

| Файл | Изменения |
|------|-----------|
| `supabase/functions/ethereal_messages/index.ts` | Строки 211-218: добавить проверку updateError + каскадный cleanup |
| `src/hooks/useEtherealRealtime.ts` | Строка 32: добавить seenBroadcastRef; Строки 85-109: рефакторинг broadcast handler |

---

## Тестирование (5 минут)

| Тест | Ожидаемый результат |
|------|---------------------|
| Фото-only отправка | `{success:true, imagePath, imageUrl}` |
| Искусственно сломать update (неверное имя колонки) | response `update_error`, файл удалён, сообщение удалено или помечено `[image upload failed]` |
| Dev с Strict Mode: отправить 1 сообщение | В Dexie ровно 1 запись по serverId |
| 2+ быстрых broadcast с одним serverId | В UI и Dexie — только одна запись |

---

## Порядок реализации

1. Edge Function: добавить проверку updateError + cleanup
2. useEtherealRealtime: добавить seenBroadcastRef
3. useEtherealRealtime: рефакторинг broadcast handler
4. Deploy Edge Function
5. Тестирование
