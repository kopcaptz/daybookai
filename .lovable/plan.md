
# План: Полная локализация напоминаний для иврита и арабского

## Проблема

На скриншоте видно:
- Все тексты на английском вместо иврита
- Вопросительные знаки стоят в начале ("?What to remind") вместо конца
- Нет RTL-адаптации layout

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/reminderUtils.ts` | Добавить `labelHe`, `labelAr` во все структуры, обновить `formatDueDate` |
| `src/components/reminders/QuickReminderSheet.tsx` | 4-языковые переводы + RTL-фиксы |
| `src/components/reminders/ReminderPrompt.tsx` | 4-языковые переводы + RTL-фиксы |
| `src/pages/ReminderDetailPage.tsx` | 4-языковые переводы |

---

## Изменение 1: `src/lib/reminderUtils.ts`

### Обновить интерфейсы

```typescript
export interface TimeChip {
  id: SuggestedTime;
  labelRu: string;
  labelEn: string;
  labelHe: string;  // ← добавить
  labelAr: string;  // ← добавить
  getTimestamp: () => number;
}

export interface SnoozePreset {
  id: string;
  labelRu: string;
  labelEn: string;
  labelHe: string;  // ← добавить
  labelAr: string;  // ← добавить
  getTimestamp: () => number;
}
```

### Обновить TIME_CHIPS

```typescript
export const TIME_CHIPS: TimeChip[] = [
  {
    id: 'later_today',
    labelRu: 'Сегодня позже',
    labelEn: 'Later today',
    labelHe: 'מאוחר יותר היום',
    labelAr: 'لاحقاً اليوم',
    getTimestamp: getLaterTodayTimestamp,
  },
  {
    id: 'tomorrow_morning',
    labelRu: 'Завтра утром',
    labelEn: 'Tomorrow morning',
    labelHe: 'מחר בבוקר',
    labelAr: 'صباح الغد',
    getTimestamp: getTomorrowMorningTimestamp,
  },
  {
    id: 'weekend',
    labelRu: 'В выходные',
    labelEn: 'Weekend',
    labelHe: 'סוף השבוע',
    labelAr: 'نهاية الأسبوع',
    getTimestamp: getWeekendTimestamp,
  },
  {
    id: 'next_week',
    labelRu: 'На неделе',
    labelEn: 'Next week',
    labelHe: 'השבוע הבא',
    labelAr: 'الأسبوع القادم',
    getTimestamp: getNextWeekTimestamp,
  },
];
```

### Обновить SNOOZE_PRESETS

```typescript
export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    id: '1h',
    labelRu: 'Через 1 час',
    labelEn: 'In 1 hour',
    labelHe: 'בעוד שעה',
    labelAr: 'بعد ساعة',
    getTimestamp: getOneHourTimestamp,
  },
  {
    id: 'later_today',
    labelRu: 'Позже сегодня',
    labelEn: 'Later today',
    labelHe: 'מאוחר יותר היום',
    labelAr: 'لاحقاً اليوم',
    getTimestamp: getLaterTodayTimestamp,
  },
  {
    id: 'tomorrow_9am',
    labelRu: 'Завтра в 9:00',
    labelEn: 'Tomorrow 9am',
    labelHe: 'מחר ב-9:00',
    labelAr: 'غداً الساعة 9:00',
    getTimestamp: getTomorrowMorningTimestamp,
  },
];
```

### Обновить REPEAT_OPTIONS

```typescript
export const REPEAT_OPTIONS: { 
  value: ReminderRepeat; 
  labelRu: string; 
  labelEn: string;
  labelHe: string;
  labelAr: string;
}[] = [
  { value: 'none', labelRu: 'Не повторять', labelEn: 'No repeat', labelHe: 'ללא חזרה', labelAr: 'بدون تكرار' },
  { value: 'daily', labelRu: 'Ежедневно', labelEn: 'Daily', labelHe: 'יומי', labelAr: 'يومياً' },
  { value: 'weekly', labelRu: 'Еженедельно', labelEn: 'Weekly', labelHe: 'שבועי', labelAr: 'أسبوعياً' },
  { value: 'monthly', labelRu: 'Ежемесячно', labelEn: 'Monthly', labelHe: 'חודשי', labelAr: 'شهرياً' },
];
```

### Обновить formatDueDate для 4 языков

```typescript
export function formatDueDate(dueAt: number, language: string): string {
  const date = new Date(dueAt);
  const now = new Date();
  
  if (isOverdue(dueAt)) {
    const labels = { ru: 'Просрочено', en: 'Overdue', he: 'באיחור', ar: 'متأخر' };
    return labels[language as keyof typeof labels] || labels.en;
  }
  
  if (isDueToday(dueAt)) {
    const timeStr = format(date, 'HH:mm');
    const labels = { 
      ru: `Сегодня, ${timeStr}`, 
      en: `Today, ${timeStr}`,
      he: `היום, ${timeStr}`,
      ar: `اليوم، ${timeStr}`
    };
    return labels[language as keyof typeof labels] || labels.en;
  }
  
  // Tomorrow
  const tomorrow = addDays(startOfDay(now), 1);
  if (date >= tomorrow && date < addDays(tomorrow, 1)) {
    const timeStr = format(date, 'HH:mm');
    const labels = { 
      ru: `Завтра, ${timeStr}`, 
      en: `Tomorrow, ${timeStr}`,
      he: `מחר, ${timeStr}`,
      ar: `غداً، ${timeStr}`
    };
    return labels[language as keyof typeof labels] || labels.en;
  }
  
  // Further out - use baseLang for date-fns formatting
  const baseLang = language === 'ru' ? 'ru' : 'en';
  const dateStr = format(date, baseLang === 'ru' ? 'd MMM, HH:mm' : 'MMM d, HH:mm');
  return dateStr;
}
```

### Добавить helper для получения label

```typescript
/**
 * Get localized label from multi-language object
 */
export function getLabel(
  labels: { labelRu: string; labelEn: string; labelHe: string; labelAr: string },
  language: string
): string {
  switch (language) {
    case 'ru': return labels.labelRu;
    case 'he': return labels.labelHe;
    case 'ar': return labels.labelAr;
    default: return labels.labelEn;
  }
}
```

---

## Изменение 2: `src/components/reminders/QuickReminderSheet.tsx`

### Добавить импорт he, ar локалей (не нужно - используем getBaseLanguage для date-fns)

### Обновить все inline переводы

```typescript
// Вместо:
{language === 'ru' ? 'Новое напоминание' : 'New reminder'}

// Использовать объект:
const texts = {
  title: { ru: 'Новое напоминание', en: 'New reminder', he: 'תזכורת חדשה', ar: 'تذكير جديد' },
  description: { ru: 'Создайте напоминание о важном деле', en: 'Create a reminder for something important', he: 'צור תזכורת לדבר חשוב', ar: 'أنشئ تذكيراً لشيء مهم' },
  whatToRemind: { ru: 'Что напомнить?', en: 'What to remind?', he: 'מה להזכיר?', ar: 'ماذا تريد تذكيرك به؟' },
  placeholder: { ru: 'Напр: Позвонить маме', en: 'E.g: Call mom', he: 'לדוגמה: להתקשר לאמא', ar: 'مثال: اتصل بأمي' },
  when: { ru: 'Когда?', en: 'When?', he: 'מתי?', ar: 'متى؟' },
  pickDate: { ru: 'Выбрать дату…', en: 'Pick date…', he: 'בחר תאריך…', ar: 'اختر تاريخ…' },
  clearDate: { ru: 'Очистить дату', en: 'Clear date', he: 'נקה תאריך', ar: 'مسح التاريخ' },
  repeat: { ru: 'Повторять', en: 'Repeat', he: 'חזרה', ar: 'تكرار' },
  cancel: { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  create: { ru: 'Создать', en: 'Create', he: 'צור', ar: 'إنشاء' },
  creating: { ru: 'Создание...', en: 'Creating...', he: 'יוצר...', ar: 'جاري الإنشاء...' },
  selected: { ru: 'Выбрано', en: 'Selected', he: 'נבחר', ar: 'تم الاختيار' },
  enterText: { ru: 'Введите текст напоминания', en: 'Enter reminder text', he: 'הכנס טקסט לתזכורת', ar: 'أدخل نص التذكير' },
  selectFuture: { ru: 'Выберите время в будущем', en: 'Select a future time', he: 'בחר זמן בעתיד', ar: 'اختر وقتاً في المستقبل' },
  created: { ru: 'Напоминание создано', en: 'Reminder created', he: 'התזכורת נוצרה', ar: 'تم إنشاء التذكير' },
  failed: { ru: 'Ошибка создания', en: 'Creation failed', he: 'היצירה נכשלה', ar: 'فشل الإنشاء' },
};

const getText = (key: keyof typeof texts) => texts[key][language as keyof typeof texts[typeof key]] || texts[key].en;
```

### RTL-фиксы

```typescript
// SheetHeader: text-left → text-start
<SheetHeader className="text-start">

// Button с CalendarIcon: mr-2 → me-2
<CalendarIcon className="h-4 w-4 me-2" />
```

---

## Изменение 3: `src/components/reminders/ReminderPrompt.tsx`

### Аналогичные 4-языковые переводы

```typescript
const texts = {
  title: { ru: 'Добавить напоминание?', en: 'Add a reminder?', he: 'להוסיף תזכורת?', ar: 'إضافة تذكير؟' },
  description: { ru: 'Похоже, это важное дело. Напомнить позже?', en: 'This looks like an action item. Set a reminder?', he: 'נראה כמו משימה חשובה. להזכיר לך?', ar: 'يبدو أن هذا أمر مهم. تعيين تذكير؟' },
  whenToRemind: { ru: 'Когда напомнить?', en: 'When to remind?', he: 'מתי להזכיר?', ar: 'متى تريد التذكير؟' },
  notNow: { ru: 'Не сейчас', en: 'Not now', he: 'לא עכשיו', ar: 'ليس الآن' },
  create: { ru: 'Создать', en: 'Create', he: 'צור', ar: 'إنشاء' },
  creating: { ru: 'Создание...', en: 'Creating...', he: 'יוצר...', ar: 'جاري الإنشاء...' },
  entryNotFound: { ru: 'Ошибка: запись не найдена', en: 'Error: entry not found', he: 'שגיאה: הרשומה לא נמצאה', ar: 'خطأ: المدخل غير موجود' },
  invalidTime: { ru: 'Ошибка времени', en: 'Invalid time', he: 'זמן שגוי', ar: 'وقت غير صالح' },
  created: { ru: 'Напоминание создано', en: 'Reminder created', he: 'התזכורת נוצרה', ar: 'تم إنشاء التذكير' },
  failed: { ru: 'Ошибка создания', en: 'Creation failed', he: 'היצירה נכשלה', ar: 'فشل الإنشاء' },
};
```

---

## Изменение 4: `src/pages/ReminderDetailPage.tsx`

### Добавить локальный объект текстов

```typescript
const texts = {
  notFound: { ru: 'Напоминание не найдено', en: 'Reminder not found', he: 'התזכורת לא נמצאה', ar: 'التذكير غير موجود' },
  notFoundHint: { ru: 'Возможно, оно было удалено или выполнено.', en: 'It may have been deleted or completed.', he: 'אולי נמחקה או הושלמה.', ar: 'ربما تم حذفه أو إكماله.' },
  back: { ru: 'Назад', en: 'Back to Today', he: 'חזרה', ar: 'رجوع' },
  reminder: { ru: 'Напоминание', en: 'Reminder', he: 'תזכורת', ar: 'تذكير' },
  deleteConfirm: { ru: 'Удалить напоминание?', en: 'Delete reminder?', he: 'למחוק תזכורת?', ar: 'حذف التذكير؟' },
  deleteHint: { ru: 'Это действие нельзя отменить.', en: 'This action cannot be undone.', he: 'לא ניתן לבטל פעולה זו.', ar: 'لا يمكن التراجع عن هذا الإجراء.' },
  cancel: { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  delete: { ru: 'Удалить', en: 'Delete', he: 'מחק', ar: 'حذف' },
  whatToDo: { ru: 'Что нужно сделать', en: 'What to do', he: 'מה לעשות', ar: 'ما يجب فعله' },
  actionPlaceholder: { ru: 'Действие...', en: 'Action...', he: 'פעולה...', ar: 'إجراء...' },
  save: { ru: 'Сохранить', en: 'Save', he: 'שמור', ar: 'حفظ' },
  saved: { ru: 'Сохранено', en: 'Saved', he: 'נשמר', ar: 'تم الحفظ' },
  saveFailed: { ru: 'Ошибка сохранения', en: 'Save failed', he: 'השמירה נכשלה', ar: 'فشل الحفظ' },
  when: { ru: 'Когда', en: 'When', he: 'מתי', ar: 'متى' },
  reschedule: { ru: 'Изменить время', en: 'Reschedule', he: 'שנה זמן', ar: 'إعادة جدولة' },
  rescheduled: { ru: 'Время изменено', en: 'Rescheduled', he: 'הזמן שונה', ar: 'تمت إعادة الجدولة' },
  repeat: { ru: 'Повторять', en: 'Repeat', he: 'חזרה', ar: 'تكرار' },
  skipNext: { ru: 'Пропустить следующее', en: 'Skip next', he: 'דלג על הבא', ar: 'تخطي التالي' },
  skipNextConfirm: { ru: 'Пропустить следующее?', en: 'Skip next?', he: 'לדלג על הבא?', ar: 'تخطي التالي؟' },
  skipNextHint: { ru: 'Следующее повторение не будет создано при выполнении.', en: 'The next occurrence will not be created when you complete this reminder.', he: 'ההתרחשות הבאה לא תיווצר כשתסיים את התזכורת.', ar: 'لن يتم إنشاء التكرار التالي عند إكمال هذا التذكير.' },
  skip: { ru: 'Пропустить', en: 'Skip', he: 'דלג', ar: 'تخطي' },
  snooze: { ru: 'Отложить', en: 'Snooze', he: 'נודניק', ar: 'تأجيل' },
  snoozed: { ru: 'Отложено', en: 'Snoozed', he: 'נדחה', ar: 'تم التأجيل' },
  sourceEntry: { ru: 'Запись-источник', en: 'Source entry', he: 'רשומת מקור', ar: 'المدخل المصدر' },
  showSource: { ru: 'Показать полный текст', en: 'Show full text', he: 'הצג טקסט מלא', ar: 'إظهار النص الكامل' },
  hideSource: { ru: 'Скрыть', en: 'Hide', he: 'הסתר', ar: 'إخفاء' },
  openEntry: { ru: 'Открыть запись', en: 'Open entry', he: 'פתח רשומה', ar: 'فتح المدخل' },
  noSource: { ru: 'Источник недоступен', en: 'Source unavailable', he: 'המקור לא זמין', ar: 'المصدر غير متاح' },
  done: { ru: 'Выполнено', en: 'Done', he: 'בוצע', ar: 'تم' },
  doneSuccess: { ru: 'Выполнено!', en: 'Done!', he: 'בוצע!', ar: 'تم!' },
  dismiss: { ru: 'Отклонить', en: 'Dismiss', he: 'התעלם', ar: 'رفض' },
  dismissed: { ru: 'Отклонено', en: 'Dismissed', he: 'נדחה', ar: 'تم الرفض' },
  deleted: { ru: 'Удалено', en: 'Deleted', he: 'נמחק', ar: 'تم الحذف' },
  error: { ru: 'Ошибка', en: 'Failed', he: 'נכשל', ar: 'فشل' },
};
```

---

## RTL-фиксы

Во всех компонентах:
- `text-left` → `text-start`
- `mr-2` → `me-2`
- `ml-2` → `ms-2`

---

## Тестирование

После изменений проверить:
1. Переключить язык на иврит
2. Открыть "+" → "Напоминание"
3. Убедиться, что все тексты на иврите
4. Проверить правильность позиции вопросительных знаков
5. Повторить для арабского
