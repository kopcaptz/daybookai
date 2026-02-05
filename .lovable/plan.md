
# План: Миграция console.* на logger

## Цель
Завершить миграцию 15 вызовов `console.*` в 8 файлах на централизованный `logger` для:
- Скрытия debug/info логов в production
- Автоматической маскировки чувствительных данных
- Отправки ошибок в crash reporter

---

## Файлы и изменения

### 1. src/lib/aiAuthRecovery.ts (4 замены)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 100 | `console.log('[aiAuthRecovery] PIN dialog already pending, joining existing request')` | `logger.debug('AuthRecovery', 'PIN dialog already pending, joining existing request')` |
| 127 | `console.error('PIN dialog listener error:', e)` | `logger.error('AuthRecovery', 'PIN dialog listener error', e)` |
| 148 | `console.log('[aiAuthRecovery] PIN success, resolving all waiters')` | `logger.debug('AuthRecovery', 'PIN success, resolving all waiters')` |
| 160 | `console.log('[aiAuthRecovery] PIN cancelled, rejecting all waiters')` | `logger.debug('AuthRecovery', 'PIN cancelled, rejecting all waiters')` |

---

### 2. src/lib/ai/discussions.ts (1 замена)

**Добавить импорт:**
```typescript
import { logger } from '../logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 424 | `console.error('[discussions] AI request failed:', error)` | `logger.error('Discussions', 'AI request failed', error as Error)` |

---

### 3. src/lib/audioTranscriptionService.ts (1 замена)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 76 | `console.error('Transcription request failed:', error)` | `logger.error('Transcription', 'Request failed', error as Error)` |

---

### 4. src/lib/gameService.ts (1 замена)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 89 | `console.error('Game API error:', error)` | `logger.error('GameService', 'API error', error as Error)` |

---

### 5. src/lib/imageAnalysisService.ts (1 замена)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 224 | `console.error('Image analysis failed:', error)` | `logger.error('ImageAnalysis', 'Analysis failed', error as Error)` |

---

### 6. src/lib/scanDiagnostics.ts (2 замены)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 12 | `console.info('[ScanDiagnostics] Logged scan attempt:', {...})` | `logger.info('ScanDiagnostics', 'Logged scan attempt', {...})` |
| 15 | `console.error('[ScanDiagnostics] Failed to log scan attempt:', error)` | `logger.error('ScanDiagnostics', 'Failed to log scan attempt', error as Error)` |

---

### 7. src/lib/weeklyInsightsService.ts (4 замены)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 68 | `console.warn('Failed to get cached weekly insight:', e)` | `logger.warn('WeeklyInsights', 'Failed to get cached insight', e)` |
| 80 | `console.warn('Failed to save weekly insight:', e)` | `logger.warn('WeeklyInsights', 'Failed to save insight', e)` |
| 133 | `console.error('Weekly insights API error:', error)` | `logger.error('WeeklyInsights', 'API error', new Error(String(error)))` |
| 156 | `console.error('Weekly insights generation failed:', e)` | `logger.error('WeeklyInsights', 'Generation failed', e as Error)` |

---

### 8. src/lib/whisperService.ts (1 замена)

**Добавить импорт:**
```typescript
import { logger } from './logger';
```

**Замены:**
| Строка | Было | Стало |
|--------|------|-------|
| 170 | `console.log('Whisper AI unavailable, using fallback')` | `logger.debug('Whisper', 'AI unavailable, using fallback')` |

---

## Результат после миграции

| Уровень | Production | Dev | Crash Reporter |
|---------|------------|-----|----------------|
| `logger.debug` | Скрыт | Видим | - |
| `logger.info` | Скрыт | Видим | - |
| `logger.warn` | Видим | Видим | - |
| `logger.error` | Видим | Видим | Автоотправка |

**Итого: 15 замен в 8 файлах + 8 импортов**

---

## Оценка времени
~10 минут (параллельные изменения)
