

# План: Фаза 1 — Отправка фотографий (с критическими исправлениями)

## Обзор

Реализовать безопасную отправку фотографий в Ethereal чат с учётом двух критических замечаний:
- **A**: `content` сейчас `NOT NULL` — выбираем Вариант 2 (быстро): при image-only сервер пишет `content = ''`, UI скрывает пустой текст
- **B**: RLS политика только для bucket `ethereal-media`, не трогаем другие

---

## 1. База данных

### Миграция 1: Расширить ethereal_messages

```sql
-- Добавить поля для изображений
ALTER TABLE public.ethereal_messages
  ADD COLUMN image_path TEXT,
  ADD COLUMN image_mime TEXT,
  ADD COLUMN image_w INTEGER,
  ADD COLUMN image_h INTEGER;

-- ВАЖНО: content остаётся NOT NULL
-- При image-only Edge Function будет записывать content = ''
```

**Почему `image_path`, а не `image_url`:**
- path стабильный: `{roomId}/{messageId}.jpg`
- URL динамический (signed, с TTL 30 минут)
- При смене политики path не ломает данные

### Миграция 2: Создать приватный storage bucket

```sql
-- Создать bucket (PRIVATE)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ethereal-media', 'ethereal-media', false, 2097152);

-- RLS: deny direct access ТОЛЬКО для этого bucket
-- (не трогаем другие buckets!)
CREATE POLICY "deny_direct_ethereal_media"
ON storage.objects
FOR ALL
USING (bucket_id = 'ethereal-media' AND false)
WITH CHECK (bucket_id = 'ethereal-media' AND false);
```

---

## 2. Edge Function: ethereal_messages (расширение)

### POST — принять FormData

**Новый flow:**

```text
┌─────────────┐   FormData    ┌────────────────────┐
│   Клиент    │──────────────▶│  ethereal_messages │
│  (compress) │  content?     │      POST          │
│             │  image?       └────────────────────┘
└─────────────┘                       │
                  ┌───────────────────┼───────────────────┐
                  ▼                   ▼                   ▼
            1. validate         2. insert row       3. upload file
               token            (content или '')    (если есть image)
                                     │                    │
                                     ▼                    ▼
                              3. update row:        path: {roomId}/
                              image_path, mime,     {messageId}.jpg
                              width, height
```

**Ключевые проверки:**
- `content` и `image` — хотя бы одно обязательно
- MIME: только `image/jpeg`, `image/webp`, `image/png`
- Size: ≤ 2MB
- Если только image → `content = ''`

**Порядок операций (важно для коллизий):**
1. INSERT row → получить `messageId`
2. Upload file → `{roomId}/{messageId}.ext`
3. UPDATE row → `image_path`, `image_mime`, `image_w`, `image_h`
4. RETURN → `{ id, createdAtMs, imagePath, signedUrl }`

### GET — добавить signedUrl

```typescript
// В маппинге сообщений
const messagesWithUrls = await Promise.all(
  data.map(async (m: any) => {
    let imageUrl = null;
    if (m.image_path) {
      const { data: signedData } = await supabase.storage
        .from('ethereal-media')
        .createSignedUrl(m.image_path, 1800); // 30 минут
      imageUrl = signedData?.signedUrl;
    }
    return {
      serverId: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.display_name || 'Unknown',
      content: m.content,
      createdAtMs: Date.parse(m.created_at),
      imagePath: m.image_path,
      imageUrl,
      imageMime: m.image_mime,
      imageW: m.image_w,
      imageH: m.image_h,
    };
  })
);
```

**Стратегия A (простая):** GET list всегда возвращает свежий signedUrl
- Для limit=50 это нормально (50 вызовов createSignedUrl через Promise.all)
- UI не думает об истечении URL
- При reconcile URL обновляются автоматически

---

## 3. Клиент: Dexie схема (v3)

### Расширить EtherealMessage

```typescript
export interface EtherealMessage {
  serverId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAtMs: number;
  syncStatus: 'synced' | 'failed';
  // NEW: image fields
  imagePath?: string;    // stable path: roomId/msgId.jpg
  imageUrl?: string;     // transient signed URL
  imageMime?: string;
  imageW?: number;
  imageH?: number;
}
```

### Миграция v3

```typescript
this.version(3)
  .stores({
    messages: 'serverId, roomId, createdAtMs, [roomId+createdAtMs]',
    // остальные таблицы без изменений
  });
// Нет upgrade — новые поля опциональны
```

---

## 4. Клиент: useEtherealRealtime

### sendMessage с опциональным imageBlob

```typescript
const sendMessage = useCallback(
  async (content: string, imageBlob?: Blob) => {
    const currentSession = getEtherealSession();
    if (!currentSession) return { success: false, error: 'no_session' };

    // Prepare FormData
    const formData = new FormData();
    formData.append('content', content.trim() || ''); // пустая строка если только фото
    if (imageBlob) {
      formData.append('image', imageBlob, 'photo.jpg');
    }

    // Remove Content-Type header (browser sets boundary automatically)
    const headers = { ...getEtherealApiHeaders() };
    delete headers['Content-Type'];

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_messages`, {
      method: 'POST',
      headers,
      body: formData,
    });

    // ... error handling

    const data = await response.json();
    // data: { id, createdAtMs, imagePath?, imageUrl? }

    const newMsg: EtherealMessage = {
      serverId: data.id,
      roomId: currentSession.roomId,
      senderId: currentSession.memberId,
      senderName: currentSession.displayName,
      content: content.trim() || '',
      createdAtMs: data.createdAtMs,
      syncStatus: 'synced',
      imagePath: data.imagePath,
      imageUrl: data.imageUrl,
    };

    // UI update + Dexie + broadcast
  },
  []
);
```

### Broadcast payload (imagePath, не только URL)

```json
{
  "serverId": "uuid",
  "createdAtMs": 1234567890,
  "content": "",
  "imagePath": "roomId/msgId.jpg",
  "imageUrl": "https://...signed...",
  "imageMime": "image/jpeg",
  "imageW": 1024,
  "imageH": 768
}
```

**Почему `imagePath` в broadcast:**
- URL протухнет через 30 минут
- Получатель при ошибке картинки может запросить новый URL или дождаться reconcile

---

## 5. UI: EtherealChat.tsx

### Новый компонент: EtherealMediaButton

```tsx
// src/components/ethereal/EtherealMediaButton.tsx
interface Props {
  onImageSelect: (blob: Blob) => void;
  disabled?: boolean;
}

export function EtherealMediaButton({ onImageSelect, disabled }: Props) {
  // Кнопка "+" с dropdown: Камера / Галерея
  // При выборе → compressChatImage → onImageSelect(blob)
}
```

**Переиспользуем:** `compressChatImage` из `src/lib/chatImageUtils.ts`
- Сжатие до 400KB target / 1.5MB hard limit
- JPEG качество 0.85 → 0.4
- Max dimension 1600px

### Изменения в EtherealChat.tsx

```tsx
// Новый state
const [pendingImage, setPendingImage] = useState<{
  blob: Blob;
  preview: string; // Object URL
} | null>(null);

// Обработчик отправки
const handleSend = async () => {
  if (!input.trim() && !pendingImage) return;
  // ...
  await sendMessage(input.trim(), pendingImage?.blob);
  // cleanup
};

// Превью выбранного изображения
{pendingImage && (
  <div className="relative w-20 h-20">
    <img src={pendingImage.preview} />
    <button onClick={() => clearPendingImage()}>✕</button>
  </div>
)}

// В сообщениях — отображение картинки
{msg.imageUrl && (
  <img 
    src={msg.imageUrl}
    className="max-w-[200px] rounded-lg cursor-pointer"
    onClick={() => window.open(msg.imageUrl, '_blank')}
  />
)}

// Скрываем пустой content
{msg.content && (
  <p className="text-sm">{msg.content}</p>
)}
```

---

## 6. Обработка пустого content в UI

Поскольку `content` остаётся NOT NULL и при image-only будет `''`:

```tsx
// В рендере сообщения
<div className="...">
  {/* Показываем текст только если он не пустой */}
  {msg.content && (
    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
  )}
  
  {/* Показываем картинку если есть */}
  {msg.imageUrl && (
    <img src={msg.imageUrl} className="max-w-[200px] rounded-lg" />
  )}
</div>
```

---

## Порядок реализации

| # | Шаг | Файл/Инструмент | Сложность |
|---|-----|-----------------|-----------|
| 1 | Миграция БД: image fields | SQL migration | Низкая |
| 2 | Миграция БД: storage bucket | SQL migration | Низкая |
| 3 | Edge Function: POST FormData | ethereal_messages/index.ts | Средняя |
| 4 | Edge Function: GET + signedUrl | ethereal_messages/index.ts | Низкая |
| 5 | Dexie v3 | etherealDb.ts | Низкая |
| 6 | useEtherealRealtime: FormData | useEtherealRealtime.ts | Средняя |
| 7 | EtherealMediaButton | Новый компонент | Низкая |
| 8 | EtherealChat UI | EtherealChat.tsx | Средняя |

---

## Ограничения

| Параметр | Значение |
|----------|----------|
| Max размер изображения | 2MB после сжатия |
| Формат сжатия | JPEG (качество 0.85 → 0.4) |
| TTL signed URL | 30 минут |
| Путь в storage | `{roomId}/{messageId}.jpg` |
| content при image-only | пустая строка `''` |

---

## Безопасность

| Аспект | Реализация |
|--------|------------|
| Bucket | `public = false` |
| RLS | `USING (bucket_id = 'ethereal-media' AND false)` |
| Upload | Только через Edge Function (service_role) |
| Download | Signed URL с TTL 30 минут |
| Validation | MIME + size на сервере |
| Path isolation | `{roomId}/` — файлы изолированы по комнатам |

---

## Что не меняем

- `content` остаётся NOT NULL (Вариант 2)
- Существующий bucket `feedback-attachments` не затрагивается
- Диагностические логи остаются для тестирования

