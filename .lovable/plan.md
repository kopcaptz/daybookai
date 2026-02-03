
# План: i18n для FeedbackModal

## Проблема

На скриншоте видно, что модал "Связь с Мастером" показывает русский текст даже в Hebrew-режиме:
- "Связь с Мастером" (заголовок)
- "Изложите вашу мысль..." (placeholder)
- "Прикрепить артефакт" (кнопка)
- "Отправить в эфир" (submit)
- Toast-сообщения на русском

---

## Решение

Интегрировать `useI18n()` и добавить ключи `feedback.*` для всех языков.

---

## Изменения

### Файл: `src/lib/i18n.tsx`

Добавить новую секцию переводов:

```typescript
// Feedback Modal
'feedback.title': { 
  ru: 'Связь с Мастером', 
  en: 'Contact the Master', 
  he: 'קשר עם המאסטר', 
  ar: 'تواصل مع المعلم' 
},
'feedback.placeholder': { 
  ru: 'Изложите вашу мысль...', 
  en: 'Share your thoughts...', 
  he: 'שתפו את מחשבותיכם...', 
  ar: 'شاركنا أفكارك...' 
},
'feedback.attachArtifact': { 
  ru: 'Прикрепить артефакт', 
  en: 'Attach artifact', 
  he: 'צרף קובץ', 
  ar: 'إرفاق ملف' 
},
'feedback.submit': { 
  ru: 'Отправить в эфир', 
  en: 'Send to ether', 
  he: 'שלח', 
  ar: 'إرسال' 
},
'feedback.submitting': { 
  ru: 'Отправка...', 
  en: 'Sending...', 
  he: 'שולח...', 
  ar: 'جاري الإرسال...' 
},
'feedback.successTitle': { 
  ru: 'Сообщение отправлено в архив', 
  en: 'Message sent to archive', 
  he: 'ההודעה נשלחה', 
  ar: 'تم إرسال الرسالة' 
},
'feedback.successDesc': { 
  ru: 'Мастер получит ваше послание', 
  en: 'The Master will receive your message', 
  he: 'המאסטר יקבל את הודעתך', 
  ar: 'سيستلم المعلم رسالتك' 
},
'feedback.errorTitle': { 
  ru: 'Ошибка отправки', 
  en: 'Send error', 
  he: 'שגיאה בשליחה', 
  ar: 'خطأ في الإرسال' 
},
'feedback.errorDesc': { 
  ru: 'Не удалось отправить сообщение. Попробуйте позже.', 
  en: 'Failed to send message. Try again later.', 
  he: 'לא ניתן לשלוח את ההודעה. נסו שוב מאוחר יותר.', 
  ar: 'فشل إرسال الرسالة. حاول مرة أخرى لاحقاً.' 
},
'feedback.fileTooLargeTitle': { 
  ru: 'Файл слишком большой', 
  en: 'File too large', 
  he: 'הקובץ גדול מדי', 
  ar: 'الملف كبير جداً' 
},
'feedback.fileTooLargeDesc': { 
  ru: 'Максимальный размер изображения — 5 МБ', 
  en: 'Maximum image size is 5 MB', 
  he: 'גודל תמונה מקסימלי 5 מ"ב', 
  ar: 'الحد الأقصى لحجم الصورة 5 ميجابايت' 
},
'feedback.removeFile': { 
  ru: 'Удалить файл', 
  en: 'Remove file', 
  he: 'הסר קובץ', 
  ar: 'إزالة الملف' 
},
```

---

### Файл: `src/components/FeedbackModal.tsx`

**1. Добавить импорт i18n (строка 19)**

```tsx
import { useI18n } from '@/lib/i18n';
```

**2. Получить функцию перевода в компоненте (строка 28)**

```tsx
export function FeedbackModal({ onSecretUnlock }: FeedbackModalProps) {
  const { t } = useI18n();
  // ... rest of state
```

**3. Заменить хардкод-строки на `t()` вызовы**

| Строка | Было | Стало |
|--------|------|-------|
| 48 | `"Файл слишком большой"` | `t('feedback.fileTooLargeTitle')` |
| 49 | `"Максимальный размер..."` | `t('feedback.fileTooLargeDesc')` |
| 133 | `"Сообщение отправлено..."` | `t('feedback.successTitle')` |
| 134 | `"Мастер получит..."` | `t('feedback.successDesc')` |
| 144 | `"Ошибка отправки"` | `t('feedback.errorTitle')` |
| 145 | `"Не удалось..."` | `t('feedback.errorDesc')` |
| 184 | `aria-label="Связь с Мастером"` | `aria-label={t('feedback.title')}` |
| 240 | `Связь с Мастером` | `{t('feedback.title')}` |
| 250 | `placeholder="Изложите..."` | `placeholder={t('feedback.placeholder')}` |
| 286 | `Прикрепить артефакт` | `{t('feedback.attachArtifact')}` |
| 315 | `aria-label="Удалить файл"` | `aria-label={t('feedback.removeFile')}` |
| 346 | `"Отправка..." / "Отправить в эфир"` | `t('feedback.submitting') / t('feedback.submit')` |

**4. RTL-совместимость кнопки (строка 172)**

Заменить `left-4` на `start-4` для RTL:

```tsx
className={cn(
  "fixed top-4 start-4 z-50",  // left-4 → start-4
  // ... rest
)}
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/i18n.tsx` | Добавить ~12 ключей `feedback.*` |
| `src/components/FeedbackModal.tsx` | Интегрировать `useI18n()`, заменить строки |

---

## Результат

После изменений в Hebrew-режиме будет отображаться:
- **Заголовок**: "קשר עם המאסטר"
- **Placeholder**: "שתפו את מחשבותיכם..."
- **Кнопка attach**: "צרף קובץ"
- **Кнопка submit**: "שלח"
- **Toast success**: "ההודעה נשלחה"

Кнопка переместится в правый верхний угол (RTL) благодаря `start-4`.
