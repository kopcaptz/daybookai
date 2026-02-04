

# Layer 2 v1.0: Audio Transcription (Gemini) — Исправленный план

## Учтённые замечания

| Проблема | Исправление |
|----------|-------------|
| "Без base64" противоречие | Клиент → Edge: multipart/form-data (Blob как есть). Edge → Gemini: base64 допускается внутри сервера, т.к. Lovable AI Gateway требует. |
| MIME-типы слишком строгие | Расширить: `audio/*`, `video/webm`, `application/ogg` |
| Публичный endpoint = риск | Добавить X-AI-Token проверку (как ai-chat) |
| DB индекс | `audioTranscripts: 'attachmentId, status, createdAt'` |
| Insert кнопка | Показывать только если есть `onInsertText` callback |
| durationSec | Оставить `null` в v1.0, не обещать точность |

---

## Step 1 — IndexedDB audioTranscripts (DB v15)

### Изменения в `src/lib/db.ts`

**Новый интерфейс:**
```typescript
export interface AudioTranscript {
  attachmentId: number;      // PK, ссылка на attachments
  createdAt: number;
  updatedAt: number;
  status: 'pending' | 'done' | 'error';
  model: string;             // "google/gemini-2.5-flash"
  text: string | null;
  language: string | null;
  durationSec: number | null; // null в v1.0
  errorCode: string | null;   // too_large | unsupported_format | rate_limited | transcription_failed | auth_required | unknown
}
```

**Добавить в класс DaybookDatabase:**
```typescript
audioTranscripts!: EntityTable<AudioTranscript, 'attachmentId'>;
```

**Новая версия (v15):**
```typescript
// Version 15: Add audio transcripts table
this.version(15).stores({
  // ... все существующие таблицы без изменений (копия из v14)
  entries: '++id, date, mood, *tags, *semanticTags, isPrivate, aiAllowed, createdAt, updatedAt, aiAnalyzedAt',
  attachments: '++id, entryId, kind, createdAt',
  drafts: 'id, updatedAt',
  biographies: 'date, status, generatedAt',
  attachmentInsights: 'attachmentId, createdAt',
  receipts: '++id, entryId, date, storeName, createdAt, updatedAt',
  receiptItems: '++id, receiptId, category',
  scanLogs: '++id, timestamp',
  reminders: '++id, entryId, status, dueAt, createdAt',
  discussionSessions: '++id, updatedAt, lastMessageAt, pinned',
  discussionMessages: '++id, sessionId, [sessionId+createdAt]',
  analysisQueue: '++id, entryId, status, createdAt',
  weeklyInsights: 'weekStart, generatedAt',
  audioTranscripts: 'attachmentId, status, createdAt', // NEW
});
```

**Обновить clearAllData():**
```typescript
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [
    db.entries, db.attachments, db.drafts, 
    db.receipts, db.receiptItems, db.scanLogs,
    db.audioTranscripts, // ADD THIS
  ], async () => {
    await db.entries.clear();
    await db.attachments.clear();
    await db.drafts.clear();
    await db.receipts.clear();
    await db.receiptItems.clear();
    await db.scanLogs.clear();
    await db.audioTranscripts.clear(); // ADD THIS
  });
}
```

**Smoke-test:** Приложение стартует без ошибок миграции.

---

## Step 2 — Edge Function ai-transcribe (с X-AI-Token)

### Новый файл: `supabase/functions/ai-transcribe/index.ts`

**Ключевые особенности:**
1. **X-AI-Token валидация** — копируем из `ai-chat/index.ts`
2. **CORS с allowed origins** — как в `ai-chat`
3. **multipart/form-data** на входе
4. **base64 внутри edge** — для Lovable AI Gateway (допустимо server-side)

**Input (multipart/form-data):**
- `file`: Blob audio
- `languageHint`: "ru" | "en" | "he" | "ar" | "auto" (optional, default "auto")

**Валидация MIME-типов:**
```typescript
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'video/webm',      // браузеры часто отдают webm audio как video/webm
  'application/ogg', // некоторые браузеры
];

function isAllowedAudioType(mimeType: string): boolean {
  return ALLOWED_AUDIO_TYPES.some(t => mimeType.startsWith(t.split('/')[0]) && mimeType.includes(t.split('/')[1]));
}
```

**Output JSON:**
```json
{
  "text": "транскрипт...",
  "language": "ru",
  "model": "google/gemini-2.5-flash"
}
```

**Коды ошибок:**
| errorCode | HTTP | Условие |
|-----------|------|---------|
| too_large | 400 | file.size > 25MB |
| unsupported_format | 400 | MIME не в списке |
| auth_required | 401 | нет/невалидный X-AI-Token |
| rate_limited | 429 | Lovable AI 429 |
| payment_required | 402 | Lovable AI 402 |
| transcription_failed | 500 | Gemini error |

**Логирование (только метаданные):**
```typescript
console.log({
  requestId,
  action: "ai_transcribe_request",
  mimeType: file.type,
  sizeBytes: file.size,
  languageHint,
  // НЕ логировать transcript text
});
```

**Промпт для Gemini:**
```
Transcribe the following audio accurately.
Return ONLY the transcription text, no commentary or timestamps.
If language hint is provided, prioritize that language.
Language hint: ${languageHint || 'auto-detect'}
```

### Обновление `supabase/config.toml`:
```toml
[functions.ai-transcribe]
verify_jwt = false
```

**Smoke-test:** curl с валидным X-AI-Token возвращает текст.

---

## Step 3 — Client Service audioTranscriptionService.ts

### Новый файл: `src/lib/audioTranscriptionService.ts`

**Импорты:**
```typescript
import { db, AudioTranscript } from './db';
import { getAIToken, isAITokenValid } from './aiTokenService';
import { requestPinDialog } from './aiAuthRecovery';
```

**API:**
```typescript
export async function getCachedTranscript(
  attachmentId: number
): Promise<AudioTranscript | undefined> {
  return db.audioTranscripts.get(attachmentId);
}

export type TranscriptionResult = 
  | { ok: true; text: string; language: string }
  | { ok: false; errorCode: string };

export async function requestTranscription(
  attachmentId: number,
  blob: Blob,
  opts?: { 
    languageHint?: string; 
  }
): Promise<TranscriptionResult>;
```

**Логика requestTranscription:**
```
1. Проверить кэш (db.audioTranscripts.get)
2. Если status === 'done' → return { ok: true, text, language }
3. Если status === 'pending' → return { ok: false, errorCode: 'pending' }
4. Если status === 'error' → можно перезапустить

5. Проверить isAITokenValid()
   - Если нет → requestPinDialog() или return { ok: false, errorCode: 'auth_required' }

6. Записать pending в БД:
   db.audioTranscripts.put({
     attachmentId,
     createdAt: Date.now(),
     updatedAt: Date.now(),
     status: 'pending',
     model: 'google/gemini-2.5-flash',
     text: null,
     language: null,
     durationSec: null,
     errorCode: null,
   })

7. Отправить FormData на edge:
   const formData = new FormData();
   formData.append('file', blob);
   if (opts?.languageHint) formData.append('languageHint', opts.languageHint);
   
   const response = await fetch(AI_TRANSCRIBE_URL, {
     method: 'POST',
     headers: { 'X-AI-Token': token },
     body: formData,
   });

8. Обработать ответ:
   - 200 OK → update status='done', сохранить text/language
   - 401 → return { ok: false, errorCode: 'auth_required' }
   - 429 → return { ok: false, errorCode: 'rate_limited' }
   - 402 → return { ok: false, errorCode: 'payment_required' }
   - 400 → парсить errorCode из body
   - 500 → return { ok: false, errorCode: 'transcription_failed' }
```

**Smoke-test:** Повторное нажатие не делает второй сетевой запрос.

---

## Step 4 — UI: TranscribeSection в EntryAttachmentViewer

### Изменения в `src/components/media/EntryAttachmentViewer.tsx`

**Новые пропы для AttachmentCard:**
```typescript
interface AttachmentCardProps {
  attachment: Attachment;
  onInsertText?: (text: string) => void; // опционально, для вставки
}
```

**Новый компонент TranscribeSection:**
```typescript
function TranscribeSection({ 
  attachmentId, 
  blob, 
  onInsertText 
}: { 
  attachmentId: number; 
  blob: Blob;
  onInsertText?: (text: string) => void;
}) {
  const { t, language } = useI18n();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [transcript, setTranscript] = useState<AudioTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load cached on mount
  useEffect(() => {
    getCachedTranscript(attachmentId).then(cached => {
      if (cached) {
        setTranscript(cached);
        setState(cached.status);
        if (cached.errorCode) setError(cached.errorCode);
      }
    });
  }, [attachmentId]);

  // ... render logic
}
```

**UI состояния:**
- `idle` → кнопка "Transcribe"
- `pending` → Loader + "Transcribing..."
- `done` → текст + кнопки Copy / Insert (Insert только если есть onInsertText)
- `error` → сообщение об ошибке + Retry

**Кнопки:**
```typescript
// Copy — всегда доступна при done
<Button onClick={() => navigator.clipboard.writeText(transcript.text)}>
  {t('audio.copy')}
</Button>

// Insert — только если есть callback
{onInsertText && (
  <Button onClick={() => onInsertText(transcript.text)}>
    {t('audio.insert')}
  </Button>
)}
```

---

## Step 5 — Privacy Warning (однократно)

**localStorage key:** `audio-transcribe-privacy-accepted`

**Перед первой транскрипцией:**
```typescript
async function handleTranscribe() {
  // Check privacy consent
  if (!localStorage.getItem('audio-transcribe-privacy-accepted')) {
    const confirmed = await showPrivacyDialog(); // AlertDialog
    if (!confirmed) return;
    localStorage.setItem('audio-transcribe-privacy-accepted', 'true');
  }
  
  // Proceed with transcription
  setState('pending');
  const result = await requestTranscription(attachmentId, blob, { languageHint: language });
  // ...
}
```

**Текст диалога:**
- RU: "Аудио будет отправлено на обработку"
- EN: "Audio will be sent for processing"
- HE: "האודיו יישלח לעיבוד"
- AR: "سيتم إرسال الصوت للمعالجة"

---

## Step 6 — i18n ключи

### Добавить в `src/lib/i18n.tsx`:

```typescript
// Audio transcription
'audio.transcribe': { 
  ru: 'Транскрибировать', 
  en: 'Transcribe', 
  he: 'תמלל', 
  ar: 'نسخ صوتي' 
},
'audio.transcribing': { 
  ru: 'Транскрипция...', 
  en: 'Transcribing...', 
  he: 'מתמלל...', 
  ar: 'جاري النسخ...' 
},
'audio.transcriptionReady': { 
  ru: 'Транскрипция готова', 
  en: 'Transcription ready', 
  he: 'התמלול מוכן', 
  ar: 'النسخ جاهز' 
},
'audio.copy': { 
  ru: 'Копировать', 
  en: 'Copy', 
  he: 'העתק', 
  ar: 'نسخ' 
},
'audio.insert': { 
  ru: 'Вставить', 
  en: 'Insert', 
  he: 'הכנס', 
  ar: 'إدراج' 
},
'audio.privacyTitle': { 
  ru: 'Обработка аудио', 
  en: 'Audio Processing', 
  he: 'עיבוד אודיו', 
  ar: 'معالجة الصوت' 
},
'audio.privacyWarning': { 
  ru: 'Аудио будет отправлено на обработку', 
  en: 'Audio will be sent for processing', 
  he: 'האודיו יישלח לעיבוד', 
  ar: 'سيتم إرسال الصوت للمعالجة' 
},
'audio.tooLarge': { 
  ru: 'Файл слишком большой (макс. 25 МБ)', 
  en: 'File too large (max 25 MB)', 
  he: 'הקובץ גדול מדי (מקסימום 25 מ"ב)', 
  ar: 'الملف كبير جداً (الحد 25 ميجابايت)' 
},
'audio.unsupportedFormat': { 
  ru: 'Формат не поддерживается', 
  en: 'Unsupported format', 
  he: 'פורמט לא נתמך', 
  ar: 'تنسيق غير مدعوم' 
},
'audio.transcriptionFailed': { 
  ru: 'Не удалось транскрибировать', 
  en: 'Transcription failed', 
  he: 'התמלול נכשל', 
  ar: 'فشل النسخ' 
},
'audio.authRequired': { 
  ru: 'Требуется авторизация', 
  en: 'Authorization required', 
  he: 'נדרש אימות', 
  ar: 'مطلوب التفويض' 
},
'common.retry': { 
  ru: 'Повторить', 
  en: 'Retry', 
  he: 'נסה שוב', 
  ar: 'إعادة المحاولة' 
},
'common.continue': { 
  ru: 'Продолжить', 
  en: 'Continue', 
  he: 'המשך', 
  ar: 'استمرار' 
},
'common.cancel': { 
  ru: 'Отмена', 
  en: 'Cancel', 
  he: 'ביטול', 
  ar: 'إلغاء' 
},
```

---

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `src/lib/db.ts` | +AudioTranscript interface, +version(15), +audioTranscripts в clearAllData |
| `supabase/functions/ai-transcribe/index.ts` | Создать (с X-AI-Token, multipart, CORS) |
| `supabase/config.toml` | +[functions.ai-transcribe] |
| `src/lib/audioTranscriptionService.ts` | Создать (кэш + edge call) |
| `src/components/media/EntryAttachmentViewer.tsx` | +TranscribeSection для audio |
| `src/lib/i18n.tsx` | +audio.* и common.* ключи |

---

## Порядок реализации

1. **Step 1**: db.ts → smoke-test миграции (приложение стартует)
2. **Step 2**: Edge function + config.toml → deploy → smoke-test curl
3. **Step 3**: audioTranscriptionService.ts → smoke-test pending state
4. **Step 4**: UI TranscribeSection → smoke-test на телефоне
5. **Step 5**: Privacy warning → проверить показ один раз
6. **Step 6**: i18n → проверить все 4 языка

---

## Acceptance Checklist

- [ ] Кнопка "Transcribe" появляется только на аудио-вложениях
- [ ] Первый раз показывает privacy warning
- [ ] Pending/done/error сохраняются в IndexedDB
- [ ] Done: повторно не вызывает сеть (кэш работает)
- [ ] Без X-AI-Token → 401 auth_required
- [ ] video/webm принимается как audio
- [ ] Ошибка >25MB → too_large с понятным UI текстом
- [ ] Hebrew RTL: UI не ломается
- [ ] Insert кнопка скрыта если нет onInsertText callback

