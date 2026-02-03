
# План: Исправить направление стрелок "назад" для RTL-языков

## Проблема

На скриншоте видно, что в режиме RTL (иврит) стрелка назад указывает влево (←), но для RTL-языков "назад" должно указывать вправо (→), так как направление чтения — справа налево.

## Текущая ситуация

**Правильно реализовано:**
- `NewEntry.tsx` — использует `isRTL(language) ? ArrowRight : ArrowLeft`
- `CalendarPage.tsx` — использует условную замену иконок для навигации

**Требует исправления (10 мест):**
1. `DiscussionChatPage.tsx` — строка 221
2. `DayView.tsx` — строки 55, 72
3. `ReceiptReviewPage.tsx` — строка 175
4. `ReceiptDetailPage.tsx` — строка 180
5. `ReceiptScanPage.tsx` — строка 286
6. `ReceiptsPage.tsx` — строка 121
7. `ReceiptAnalyticsPage.tsx` — строка 154
8. `ReminderDetailPage.tsx` — строки 247, 276
9. `ChronicleView.tsx` — строка 58

---

## Решение

Для каждой страницы применить паттерн из `NewEntry.tsx`:

```tsx
// Импорт
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useI18n, isRTL } from '@/lib/i18n';

// В компоненте — определить иконку
const BackIcon = isRTL(language) ? ArrowRight : ArrowLeft;

// Использование
<Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
  <BackIcon className="h-5 w-5" />
</Button>
```

---

## Детальный план изменений

### 1. `src/pages/DiscussionChatPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 2. `src/pages/DayView.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` перед return
- Обновить оба места использования (loading state и main view)

### 3. `src/pages/ReceiptReviewPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 4. `src/pages/ReceiptDetailPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 5. `src/pages/ReceiptScanPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 6. `src/pages/ReceiptsPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 7. `src/pages/ReceiptAnalyticsPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Заменить `<ArrowLeft ...>` на `<BackIcon ...>`

### 8. `src/pages/ReminderDetailPage.tsx`

- Добавить импорт `ArrowRight` и `isRTL`
- Определить `BackIcon` внутри компонента
- Обновить оба места использования (not found и main view)

### 9. `src/components/ethereal/ChronicleView.tsx`

- Добавить импорт `ArrowRight` 
- Принимать `language` как prop или использовать i18n hook
- Определить `BackIcon` условно

---

## Файлы для изменения

| Файл | Мест изменений |
|------|----------------|
| `src/pages/DiscussionChatPage.tsx` | 1 |
| `src/pages/DayView.tsx` | 2 |
| `src/pages/ReceiptReviewPage.tsx` | 1 |
| `src/pages/ReceiptDetailPage.tsx` | 1 |
| `src/pages/ReceiptScanPage.tsx` | 1 |
| `src/pages/ReceiptsPage.tsx` | 1 |
| `src/pages/ReceiptAnalyticsPage.tsx` | 1 |
| `src/pages/ReminderDetailPage.tsx` | 2 |
| `src/components/ethereal/ChronicleView.tsx` | 1 |
| **Всего** | **11** |

---

## Визуальный результат

**До (неправильно в RTL):**
```
┌────────────────────────────┐
│ [←]  דיון חדש              │  ← Стрелка влево
└────────────────────────────┘
```

**После (правильно в RTL):**
```
┌────────────────────────────┐
│              דיון חדש  [→] │  → Стрелка вправо (назад = справа)
└────────────────────────────┘
```
