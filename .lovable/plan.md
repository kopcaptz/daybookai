
# Автоскриншот при открытии FAB: Техническое задание

## ✅ РЕАЛИЗОВАНО

Все основные компоненты реализованы:

| Файл | Статус | Описание |
|------|--------|----------|
| `src/lib/screenshotService.ts` | ✅ | Сервис захвата и обработки скриншотов |
| `src/hooks/useAutoScreenshot.ts` | ✅ | Hook для управления автоскриншотом |
| `src/components/FloatingChatButton.tsx` | ✅ | Интеграция захвата при открытии |
| `src/pages/ChatPage.tsx` | ✅ | Прием скриншота через postMessage |
| `src/lib/aiConfig.ts` | ✅ | Настройки autoScreenshot + autoScreenshotBlurPrivate |
| `src/components/AISettingsCard.tsx` | ✅ | UI toggle для автоскриншота |
| `src/lib/i18n.tsx` | ✅ | Локализация новых строк |
| `src/components/chat/AutoScreenshotPreview.tsx` | ✅ | Компонент превью с отменой |

---

## Обзор задачи

Реализован автоматический захват скриншота видимой области экрана при открытии плавающей кнопки чата (FAB), с последующей автоматической отправкой в чат вместе с промптом "Посмотри этот скрин и что на нём важно?".

---

## Архитектура решения

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTO-SCREENSHOT FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. FAB Click                                                       │
│     ↓                                                               │
│  2. Check settings.autoScreenshot                                   │
│     ↓ (if enabled)                                                  │
│  3. Capture visible area (html2canvas)                              │
│     - Exclude FAB button itself                                     │
│     - Apply privacy blur to .blur-private elements                  │
│     ↓                                                               │
│  4. Compress to PNG ≤2MB                                            │
│     ↓                                                               │
│  5. Open Sheet with Chat iframe                                     │
│     ↓                                                               │
│  6. postMessage to iframe: { type: 'AUTO_SCREENSHOT', data }        │
│     ↓                                                               │
│  7. ChatPage receives message                                       │
│     - Shows preview with Cancel option                              │
│     - Auto-fills prompt: "Посмотри этот скрин..."                   │
│     ↓                                                               │
│  8. User confirms or edits → Send                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Как использовать

1. Откройте **Настройки → AI → Автоскриншот** и включите функцию
2. Опционально включите **Размывать приватные поля** (включено по умолчанию)
3. Нажмите на плавающую кнопку чата (FAB)
4. Скриншот автоматически захватится и появится в превью
5. Отредактируйте промпт при необходимости и нажмите "Отправить"

---

## Приватность

- Поля с паролями (`input[type="password"]`) автоматически размываются
- Элементы с классом `.blur-private` также размываются
- Скриншот хранится только в памяти (не сохраняется на диск)
- Автоматически удаляется через 5 минут если не отправлен

---

## Тестовые сценарии (TODO)

1. **Desktop Chrome**: Открыть /calendar → FAB → проверить скриншот содержит календарь
2. **Mobile Safari**: Открыть / → FAB → проверить размер ≤2MB
3. **Private fields**: Открыть Settings → убедиться PIN-поле размыто
4. **Cancel flow**: FAB → Preview → Отмена → проверить state очищен
5. **Edit prompt**: FAB → Preview → Редактировать → изменить текст → Отправить
6. **Timeout cleanup**: FAB → Preview → ждать 5 мин → проверить auto-dismiss
7. **Disabled setting**: Выключить в Settings → FAB → проверить нет скриншота
