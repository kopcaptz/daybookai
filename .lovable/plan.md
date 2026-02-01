
# ТЗ: Расширенная телеметрия для тестирования

## Обзор

Четыре модуля для получения диагностической информации от тестеров:

| # | Модуль | Описание |
|---|--------|----------|
| 1 | Версия + диагностика в фидбеке | Автоматически прикреплять версию, настройки AI и scan-статистику |
| 2 | Crash Reports | Автоматическая отправка JS-ошибок с контекстом |
| 3 | Аналитика использования | Агрегированная статистика (записи, AI-вызовы, сессии) |
| 4 | Детальное отслеживание устройств | Расширенная device fingerprint + версионирование |

---

## 1. Версия + диагностика в фидбеке

### Текущее состояние
- `FeedbackModal.tsx` отправляет только: message, image, device_info (viewport, userAgent, language)
- Версия захардкожена `1.0.0` в `AdminSystemPage.tsx`
- Есть `scanDiagnostics.ts` с локальными логами, но они НЕ отправляются

### Изменения

#### 1.1 Создать `src/lib/appVersion.ts`
```typescript
export const APP_VERSION = '1.1.0'; // Или из import.meta.env.VITE_APP_VERSION
export const BUILD_DATE = '__BUILD_DATE__'; // Заменяется при сборке
```

#### 1.2 Расширить device_info в `FeedbackModal.tsx`
```typescript
const deviceInfo = {
  // Существующие поля
  userAgent: navigator.userAgent,
  language: navigator.language,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  timestamp: new Date().toISOString(),
  
  // НОВЫЕ поля
  appVersion: APP_VERSION,
  buildDate: BUILD_DATE,
  aiSettings: {
    enabled: settings.enabled,
    autoMood: settings.autoMood,
    autoTags: settings.autoTags,
    autoScreenshot: settings.autoScreenshot,
  },
  scanStats: await getScanStats(), // Из scanDiagnostics.ts
  storageUsage: await estimateStorageUsage(),
};
```

#### 1.3 Расширить таблицу `feedback`
```sql
ALTER TABLE feedback 
ADD COLUMN app_version TEXT,
ADD COLUMN diagnostics JSONB DEFAULT '{}';
```

#### 1.4 Обновить Edge Function `feedback-submit`
- Парсить новые поля из device_info
- Сохранять версию и диагностику отдельно

### Что увидит админ
```
v1.1.0 | 23 скана (2 ошибки) | AI: вкл | 45MB storage
```

---

## 2. Crash Reports (JS-ошибки)

### Текущее состояние
- `ErrorBoundary.tsx` только логирует в консоль и показывает UI
- Ошибки НЕ отправляются на сервер

### Архитектура

```
[JS Error] → [Global Handler] → [Buffer 5 errors] → [Batch send] → [crash-reports table]
                    ↓
              [ErrorBoundary]
```

### Изменения

#### 2.1 Создать `src/lib/crashReporter.ts`
```typescript
interface CrashReport {
  message: string;
  stack: string | null;
  componentStack?: string;  // Из ErrorBoundary
  url: string;
  appVersion: string;
  timestamp: number;
  sessionId: string;        // Уникальный ID сессии
  deviceInfo: {...};
  breadcrumbs: string[];    // Последние 10 действий пользователя
}

// Глобальные обработчики
window.onerror = (msg, url, line, col, error) => {...};
window.onunhandledrejection = (event) => {...};

// Буферизация и отправка
const errorBuffer: CrashReport[] = [];
function flushErrors() {...} // Отправка каждые 30 сек или при 5 ошибках
```

#### 2.2 Добавить breadcrumbs (хлебные крошки)
Логировать последние 10 действий перед ошибкой:
- Навигация между страницами
- Клики по кнопкам
- API-вызовы
- Изменения настроек

#### 2.3 Интегрировать с `ErrorBoundary.tsx`
```typescript
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  console.error('ErrorBoundary caught:', error, errorInfo);
  // НОВОЕ: отправить в crash reporter
  reportCrash({
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
  });
}
```

#### 2.4 Создать Edge Function `crash-report`
- Принимает batch ошибок
- Дедуплицирует по stack trace
- Сохраняет в таблицу `crash_reports`

#### 2.5 Создать таблицу `crash_reports`
```sql
CREATE TABLE crash_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  url TEXT,
  app_version TEXT,
  session_id TEXT,
  device_info JSONB,
  breadcrumbs JSONB,
  occurrence_count INT DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new' -- new, investigating, resolved, ignored
);
```

#### 2.6 Страница в админке `/admin/crashes`
- Список ошибок, сгруппированных по stack trace
- Кол-во occurrences
- Версии, на которых возникает
- Статус (new/investigating/resolved)

### Что увидит админ
```
🔴 TypeError: Cannot read 'length' of undefined
   in MoodSelector.tsx:45
   
   Occurrences: 12 | Versions: 1.1.0, 1.0.9 | First: 2 days ago
   
   Breadcrumbs:
   - Navigated to /new
   - Typed text (50 chars)
   - Clicked mood slider
   - ERROR
```

---

## 3. Аналитика использования

### Текущее состояние
- Нет сбора статистики
- Все данные локальные (Dexie)

### Архитектура (privacy-first)

```
[App] → [Local aggregation] → [Daily summary] → [analytics-submit] → [usage_analytics table]
                                     ↑
                            Только агрегаты, 
                            НЕ сырые данные
```

### Изменения

#### 3.1 Создать `src/lib/usageTracker.ts`
```typescript
interface DailyUsageStats {
  date: string;                    // YYYY-MM-DD
  sessionId: string;               // Анонимный ID сессии
  appVersion: string;
  
  // Записи
  entriesCreated: number;
  entriesEdited: number;
  totalTextChars: number;          // Сумма, не содержимое!
  averageMood: number;
  
  // AI использование
  aiChatMessages: number;
  aiBiographiesGenerated: number;
  aiReceiptsScanned: number;
  autoMoodSuggestions: number;
  autoMoodAccepted: number;        // Конверсия!
  autoTagsSuggested: number;
  autoTagsAccepted: number;
  
  // Фичи
  remindersCreated: number;
  discussionSessionsStarted: number;
  
  // Сессия
  sessionDurationMinutes: number;
  pagesVisited: string[];          // Только routes, не данные
}
```

#### 3.2 Локальный сбор (privacy-safe)
```typescript
// При каждом действии — инкрементируем локальный счётчик
function trackEvent(event: 'entry_created' | 'ai_chat' | 'mood_accepted' | ...) {
  const today = getTodayStats();
  today[event]++;
  saveTodayStats(today);
}
```

#### 3.3 Отправка раз в день (или при закрытии)
```typescript
// При закрытии вкладки или раз в 24 часа
window.addEventListener('beforeunload', () => {
  if (shouldSubmitStats()) {
    navigator.sendBeacon('/functions/v1/analytics-submit', JSON.stringify(stats));
  }
});
```

#### 3.4 Edge Function `analytics-submit`
- Валидация структуры
- Сохранение в `usage_analytics`

#### 3.5 Таблица `usage_analytics`
```sql
CREATE TABLE usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  session_id TEXT NOT NULL,
  app_version TEXT,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.6 Страница в админке `/admin/analytics`
- Графики по дням: записи, AI-вызовы, сессии
- Конверсия autoMood (suggested vs accepted)
- Популярные фичи
- Разбивка по версиям

### Что увидит админ
```
📊 За последние 7 дней:

Записей создано:     45  (+12% к прошлой неделе)
AI чат сообщений:    123
Авто-настроение:     78 предложено → 52 принято (67%)
Авто-теги:           89 предложено → 61 принято (69%)

Активных сессий:     8
Средняя длина:       12 мин

Версии:
- v1.1.0: 6 users
- v1.0.9: 2 users
```

---

## 4. Детальное отслеживание устройств

### Текущее состояние
```typescript
// Сейчас собирается:
deviceInfo = {
  userAgent: navigator.userAgent,
  language: navigator.language,
  viewport: { width, height },
}
```

### Расширенный device fingerprint

#### 4.1 Создать `src/lib/deviceInfo.ts`
```typescript
export async function getExtendedDeviceInfo(): Promise<ExtendedDeviceInfo> {
  return {
    // Базовые (уже есть)
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    
    // НОВЫЕ
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as any).deviceMemory,
    connection: getConnectionInfo(),
    
    // Screen
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
      orientation: screen.orientation?.type,
    },
    
    // PWA статус
    pwa: {
      isInstalled: window.matchMedia('(display-mode: standalone)').matches,
      serviceWorkerActive: !!navigator.serviceWorker?.controller,
    },
    
    // Storage
    storage: {
      quota: (await navigator.storage?.estimate())?.quota,
      usage: (await navigator.storage?.estimate())?.usage,
      persistent: await navigator.storage?.persisted?.() || false,
    },
    
    // Timezone & locale
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    
    // Browser features
    features: {
      notifications: 'Notification' in window,
      notificationPermission: Notification?.permission,
      webGL: hasWebGL(),
      indexedDB: !!window.indexedDB,
    },
  };
}

function getConnectionInfo() {
  const conn = (navigator as any).connection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType,  // "4g", "3g", "2g", "slow-2g"
    downlink: conn.downlink,            // Mbps
    rtt: conn.rtt,                      // ms
    saveData: conn.saveData,
  };
}
```

#### 4.2 Интегрировать везде
```typescript
// FeedbackModal.tsx
const deviceInfo = await getExtendedDeviceInfo();

// crashReporter.ts
const report = { ...error, deviceInfo: await getExtendedDeviceInfo() };

// usageTracker.ts
const stats = { ...metrics, deviceInfo: await getExtendedDeviceInfo() };
```

### Что увидит админ
```
📱 Device Profile:

Browser:     Chrome 120 / Android 14
Screen:      1080×2400 @2.75x (portrait)
Memory:      4GB | 8 cores
Connection:  4G (14 Mbps, 50ms RTT)
PWA:         ✅ Installed, SW active
Storage:     127MB / 2GB (persistent)
Timezone:    Europe/Moscow
Notifications: ✅ Granted
```

---

## Сводка изменений

### Новые файлы
| Файл | Назначение |
|------|------------|
| `src/lib/appVersion.ts` | Версия приложения |
| `src/lib/crashReporter.ts` | Сбор и отправка JS-ошибок |
| `src/lib/usageTracker.ts` | Аналитика использования |
| `src/lib/deviceInfo.ts` | Расширенный device fingerprint |
| `supabase/functions/crash-report/index.ts` | Edge Function для ошибок |
| `supabase/functions/analytics-submit/index.ts` | Edge Function для аналитики |
| `src/pages/AdminCrashesPage.tsx` | Страница ошибок |
| `src/pages/AdminAnalyticsPage.tsx` | Страница аналитики |

### Изменяемые файлы
| Файл | Изменение |
|------|-----------|
| `src/components/FeedbackModal.tsx` | Добавить расширенный deviceInfo + diagnostics |
| `src/components/ErrorBoundary.tsx` | Интеграция с crashReporter |
| `src/main.tsx` | Инициализация crashReporter |
| `src/App.tsx` | Инициализация usageTracker, новые роуты |
| `src/pages/AdminDashboardPage.tsx` | Карточки для Crashes и Analytics |
| `supabase/functions/feedback-submit/index.ts` | Парсинг новых полей |
| `supabase/config.toml` | Новые functions |

### Новые таблицы
```sql
-- 1. Расширение feedback
ALTER TABLE feedback 
ADD COLUMN app_version TEXT,
ADD COLUMN diagnostics JSONB DEFAULT '{}';

-- 2. Crash reports
CREATE TABLE crash_reports (...);

-- 3. Usage analytics
CREATE TABLE usage_analytics (...);
```

---

## Приоритеты реализации

| Приоритет | Модуль | Сложность | Время |
|-----------|--------|-----------|-------|
| 🔴 Высокий | 2. Crash Reports | Средняя | 3-4 часа |
| 🟡 Средний | 1. Версия + диагностика | Низкая | 1-2 часа |
| 🟡 Средний | 4. Extended Device Info | Низкая | 1 час |
| 🟢 Низкий | 3. Аналитика | Высокая | 4-5 часов |

**Рекомендация:** Начать с модулей 1+4 (быстро добавить в фидбек), затем 2 (критично для багов), потом 3.

---

## Privacy-заметки

**Что НЕ собираем:**
- Текст записей
- Содержимое чатов
- Персональные данные
- IP-адреса (не логируем)
- Точную геолокацию

**Что собираем (агрегаты):**
- Версия приложения
- Статистика использования (числа)
- Технические ошибки
- Характеристики устройства
