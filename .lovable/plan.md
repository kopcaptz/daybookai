

# ТЗ №1: Исправление бага Infinity:NaN при валидации аудио

## Проблема

При записи аудио через MediaRecorder в формате `.webm` (особенно на Chrome/Android) браузер иногда возвращает `Infinity` вместо реальной длительности аудио.

**Причина:**
- `audio.duration` возвращает `Infinity` для streaming-форматов, пока аудио не полностью загружено/декодировано
- Валидация `if (duration > maxDuration)` → `Infinity > 600` = `true` → ошибка "Аудио слишком длинное"
- Форматирование `formatDuration(Infinity)` → `Infinity:NaN`

## Решение

Добавить проверку на `Infinity` и `NaN` в функцию `getAudioDuration()`, а также использовать fallback на фактическое время записи (которое уже точно отслеживается в `AudioCapture`).

---

## Технические изменения

### 1. Файл: `src/lib/mediaUtils.ts`

**Функция `getAudioDuration()`** — добавить workaround для Infinity:

```typescript
export async function getAudioDuration(audioBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(audioBlob);
    
    // Workaround: некоторые браузеры возвращают Infinity для webm
    // Нужно дождаться полной загрузки или использовать currentTime trick
    audio.preload = 'metadata';
    
    const handleDuration = () => {
      URL.revokeObjectURL(url);
      
      // Если duration корректен — возвращаем
      if (isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
        return;
      }
      
      // Workaround: seek to end для webm
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    };
    
    audio.onloadedmetadata = handleDuration;
    
    // После seek — duration станет конечным
    audio.ontimeupdate = () => {
      URL.revokeObjectURL(url);
      audio.ontimeupdate = null;
      
      if (isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
      } else {
        // Fallback: вернуть -1, чтобы caller использовал recordingTime
        resolve(-1);
      }
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio'));
    };
    
    audio.src = url;
    audio.load();
  });
}
```

### 2. Файл: `src/lib/mediaUtils.ts`

**Функция `validateAudio()`** — использовать fallback duration:

```typescript
export async function validateAudio(
  blob: Blob, 
  fallbackDuration?: number  // ← новый параметр
): Promise<{
  valid: boolean;
  errors: string[];
  duration?: number;
}> {
  const errors: string[] = [];
  const { maxSize, maxDuration } = MEDIA_LIMITS.audio;
  
  if (blob.size > maxSize) {
    errors.push(`Аудио слишком большое...`);
  }
  
  try {
    let duration = await getAudioDuration(blob);
    
    // Если браузер вернул Infinity/-1, используем fallback
    if (!isFinite(duration) || duration <= 0) {
      duration = fallbackDuration ?? 0;
    }
    
    if (duration > maxDuration) {
      errors.push(`Аудио слишком длинное (${formatDuration(duration)}). Максимум: ${formatDuration(maxDuration)}`);
    }
    
    return { valid: errors.length === 0, errors, duration };
  } catch {
    errors.push('Не удалось прочитать аудио');
    return { valid: false, errors };
  }
}
```

### 3. Файл: `src/components/media/AudioCapture.tsx`

**handleConfirm()** — передать `recordingTime` как fallback:

```typescript
const handleConfirm = async () => {
  if (!previewBlob) return;

  setIsProcessing(true);
  try {
    // Передаём recordingTime как fallback для Infinity-duration
    const validation = await validateAudio(previewBlob, recordingTime);

    if (!validation.valid) {
      validation.errors.forEach((err) => toast.error(err));
      return;
    }

    onCapture(previewBlob, previewBlob.type, validation.duration || recordingTime);
    // ...
  }
};
```

### 4. Файл: `src/lib/mediaUtils.ts`

**formatDuration()** — защита от NaN:

```typescript
export function formatDuration(seconds: number): string {
  // Защита от Infinity/NaN
  if (!isFinite(seconds) || seconds < 0) {
    return '—';
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins === 0) return `${secs}с`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

---

## План выполнения

| Шаг | Файл | Изменение |
|-----|------|-----------|
| 1 | `src/lib/mediaUtils.ts` | Добавить workaround в `getAudioDuration()` |
| 2 | `src/lib/mediaUtils.ts` | Добавить `fallbackDuration` в `validateAudio()` |
| 3 | `src/lib/mediaUtils.ts` | Защита от NaN в `formatDuration()` |
| 4 | `src/components/media/AudioCapture.tsx` | Передать `recordingTime` как fallback |

---

## Результат

- ✅ Аудио 23 секунды будет корректно сохраняться
- ✅ Отображение времени: `0:23` вместо `Infinity:NaN`
- ✅ Валидация использует точное время записи как fallback
- ✅ Лимит 10 минут работает корректно

