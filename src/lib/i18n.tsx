import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ru' | 'en' | 'he' | 'ar';

// RTL support
export const RTL_LANGUAGES = ['he', 'ar'] as const;
export const isRTL = (lang: Language): boolean => 
  RTL_LANGUAGES.includes(lang as 'he' | 'ar');

// Helper to get base language for services that only support ru/en
export const getBaseLanguage = (lang: Language): 'ru' | 'en' => 
  lang === 'ru' ? 'ru' : 'en';

// Translation keys - single source of truth for all UI strings
export const translations = {
  // Common
  'app.name': { ru: 'Магический блокнот', en: 'Magic Notebook', he: 'מחברת קסומה', ar: 'دفتر سحري' },
  'app.subtitle': { ru: 'Записи • Медиа • Хроника дня', en: 'Entries • Media • Day Chronicle', he: 'רשומות • מדיה • כרוניקת היום', ar: 'مدخلات • وسائط • سجل اليوم' },
  'app.tagline': { ru: 'Записи • Медиа • Хроника дня', en: 'Entries • Media • Day Chronicle', he: 'רשומות • מדיה • כרוניקת היום', ar: 'مدخلات • وسائط • سجل اليوم' },
  'common.save': { ru: 'Сохранить', en: 'Save', he: 'שמור', ar: 'حفظ' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  'common.delete': { ru: 'Удалить', en: 'Delete', he: 'מחק', ar: 'حذف' },
  'common.close': { ru: 'Закрыть', en: 'Close', he: 'סגור', ar: 'إغلاق' },
  'common.back': { ru: 'Назад', en: 'Back', he: 'חזרה', ar: 'رجوع' },
  'common.search': { ru: 'Поиск', en: 'Search', he: 'חיפוש', ar: 'بحث' },
  'common.settings': { ru: 'Настройки', en: 'Settings', he: 'הגדרות', ar: 'إعدادات' },
  'common.loading': { ru: 'Загрузка...', en: 'Loading...', he: 'טוען...', ar: 'جاري التحميل...' },
  'common.error': { ru: 'Сбой', en: 'Error', he: 'שגיאה', ar: 'خطأ' },
  'common.success': { ru: 'Готово', en: 'Success', he: 'הצלחה', ar: 'نجاح' },
  'common.confirm': { ru: 'Подтвердить', en: 'Confirm', he: 'אישור', ar: 'تأكيد' },
  'common.restore': { ru: 'Восстановить', en: 'Restore', he: 'שחזר', ar: 'استعادة' },
  'common.discard': { ru: 'Отменить', en: 'Discard', he: 'בטל', ar: 'تجاهل' },
  
  // Feedback Modal
  'feedback.title': { ru: 'Связь с Мастером', en: 'Contact the Master', he: 'קשר עם המאסטר', ar: 'تواصل مع المعلم' },
  'feedback.placeholder': { ru: 'Изложите вашу мысль...', en: 'Share your thoughts...', he: 'שתפו את מחשבותיכם...', ar: 'شاركنا أفكارك...' },
  'feedback.attachArtifact': { ru: 'Прикрепить артефакт', en: 'Attach artifact', he: 'צרף קובץ', ar: 'إرفاق ملف' },
  'feedback.submit': { ru: 'Отправить в эфир', en: 'Send to ether', he: 'שלח', ar: 'إرسال' },
  'feedback.submitting': { ru: 'Отправка...', en: 'Sending...', he: 'שולח...', ar: 'جاري الإرسال...' },
  'feedback.successTitle': { ru: 'Сообщение отправлено в архив', en: 'Message sent to archive', he: 'ההודעה נשלחה', ar: 'تم إرسال الرسالة' },
  'feedback.successDesc': { ru: 'Мастер получит ваше послание', en: 'The Master will receive your message', he: 'המאסטר יקבל את הודעתך', ar: 'سيستلم المعلم رسالتك' },
  'feedback.errorTitle': { ru: 'Ошибка отправки', en: 'Send error', he: 'שגיאה בשליחה', ar: 'خطأ في الإرسال' },
  'feedback.errorDesc': { ru: 'Не удалось отправить сообщение. Попробуйте позже.', en: 'Failed to send message. Try again later.', he: 'לא ניתן לשלוח את ההודעה. נסו שוב מאוחר יותר.', ar: 'فشل إرسال الرسالة. حاول مرة أخرى لاحقاً.' },
  'feedback.fileTooLargeTitle': { ru: 'Файл слишком большой', en: 'File too large', he: 'הקובץ גדול מדי', ar: 'الملف كبير جداً' },
  'feedback.fileTooLargeDesc': { ru: 'Максимальный размер изображения — 5 МБ', en: 'Maximum image size is 5 MB', he: 'גודל תמונה מקסימלי 5 מ"ב', ar: 'الحد الأقصى لحجم الصورة 5 ميجابايت' },
  'feedback.removeFile': { ru: 'Удалить файл', en: 'Remove file', he: 'הסר קובץ', ar: 'إزالة الملف' },
  
  // Navigation
  'nav.today': { ru: 'Сегодня', en: 'Today', he: 'היום', ar: 'اليوم' },
  'nav.calendar': { ru: 'Календарь', en: 'Calendar', he: 'לוח שנה', ar: 'التقويم' },
  'nav.search': { ru: 'Поиск', en: 'Search', he: 'חיפוש', ar: 'بحث' },
  'nav.chat': { ru: 'Оракул', en: 'Oracle', he: 'אורקל', ar: 'أوراكل' },
  'nav.settings': { ru: 'Настройки', en: 'Settings', he: 'הגדרות', ar: 'إعدادات' },
  
  // Today page
  'today.noEntries': { ru: 'Записей пока нет', en: 'No entries yet', he: 'אין רשומות עדיין', ar: 'لا توجد مدخلات بعد' },
  'today.entry': { ru: 'запись', en: 'entry', he: 'רשומה', ar: 'مدخل' },
  'today.entries2_4': { ru: 'записи', en: 'entries', he: 'רשומות', ar: 'مدخلات' },
  'today.entries5_': { ru: 'записей', en: 'entries', he: 'רשומות', ar: 'مدخلات' },
  'today.startDay': { ru: 'Открой день', en: 'Start your day', he: 'התחל את היום', ar: 'ابدأ يومك' },
  'today.startDayHint': { ru: 'Нажми на книгу или + чтобы добавить первую запись', en: 'Tap the book or + to add your first entry', he: 'לחץ על הספר או + להוספת הרשומה הראשונה', ar: 'اضغط على الكتاب أو + لإضافة أول مدخل' },
  
  // Entry
  'entry.new': { ru: 'Новая запись', en: 'New Entry', he: 'רשומה חדשה', ar: 'مدخل جديد' },
  'entry.edit': { ru: 'Редактировать', en: 'Edit Entry', he: 'עריכה', ar: 'تعديل' },
  'entry.empty': { ru: 'Пустая запись', en: 'Empty entry', he: 'רשומה ריקה', ar: 'مدخل فارغ' },
  'entry.placeholder': { ru: 'Что произошло сегодня?', en: 'What happened today?', he: 'מה קרה היום?', ar: 'ماذا حدث اليوم؟' },
  'entry.private': { ru: 'Приватная запись', en: 'Private entry', he: 'רשומה פרטית', ar: 'مدخل خاص' },
  'entry.privateDesc': { ru: 'Скрыта от анализа', en: 'Hidden from analysis', he: 'מוסתר מניתוח', ar: 'مخفي من التحليل' },
  'entry.saved': { ru: 'Запись сохранена', en: 'Entry saved', he: 'הרשומה נשמרה', ar: 'تم حفظ المدخل' },
  'entry.saveFailed': { ru: 'Не удалось сохранить запись', en: 'Failed to save entry', he: 'שמירה נכשלה', ar: 'فشل الحفظ' },
  'entry.deleted': { ru: 'Запись удалена', en: 'Entry deleted', he: 'הרשומה נמחקה', ar: 'تم حذف المدخل' },
  'entry.deleteConfirm': { ru: 'Удалить запись?', en: 'Delete entry?', he: 'למחוק את הרשומה?', ar: 'حذف المدخل؟' },
  'entry.deleteDesc': { ru: 'Это действие нельзя отменить', en: 'This action cannot be undone', he: 'לא ניתן לבטל פעולה זו', ar: 'لا يمكن التراجع عن هذا الإجراء' },
  
  // Draft
  'draft.found': { ru: 'Найден черновик', en: 'Draft found', he: 'נמצא טיוטה', ar: 'تم العثور على مسودة' },
  'draft.foundDesc': { ru: 'Восстановить несохранённые изменения?', en: 'Restore unsaved changes?', he: 'לשחזר שינויים שלא נשמרו?', ar: 'استعادة التغييرات غير المحفوظة؟' },
  'draft.restored': { ru: 'Черновик восстановлен', en: 'Draft restored', he: 'טיוטה שוחזרה', ar: 'تم استعادة المسودة' },
  'draft.discarded': { ru: 'Черновик удалён', en: 'Draft discarded', he: 'טיוטה נמחקה', ar: 'تم تجاهل المسودة' },
  
  // Mood
  'mood.title': { ru: 'Настроение', en: 'Mood', he: 'מצב רוח', ar: 'المزاج' },
  'mood.1': { ru: 'Критично', en: 'Critical', he: 'קריטי', ar: 'حرج' },
  'mood.2': { ru: 'Тяжело', en: 'Rough', he: 'קשה', ar: 'صعب' },
  'mood.3': { ru: 'Ровно', en: 'Steady', he: 'יציב', ar: 'مستقر' },
  'mood.4': { ru: 'Хорошо', en: 'Good', he: 'טוב', ar: 'جيد' },
  'mood.5': { ru: 'Отлично', en: 'Great', he: 'מעולה', ar: 'ممتاز' },
  'mood.autoTitle': { ru: 'Авто-настроение', en: 'Auto Mood', he: 'מצב רוח אוטומטי', ar: 'مزاج تلقائي' },
  'mood.autoHint': { ru: 'Определять настроение по тексту записи', en: 'Detect mood from entry text', he: 'זיהוי מצב רוח מטקסט הרשומה', ar: 'اكتشاف المزاج من نص المدخل' },
  'mood.liveSuggestions': { ru: 'Живые подсказки', en: 'Live Suggestions', he: 'הצעות חיות', ar: 'اقتراحات مباشرة' },
  'mood.liveSuggestionsHint': { ru: 'Показывать подсказки во время ввода', en: 'Show suggestions while typing', he: 'הצג הצעות בזמן הקלדה', ar: 'إظهار الاقتراحات أثناء الكتابة' },
  'mood.inheritFromChat': { ru: 'Наследовать из чата', en: 'Inherit from Chat', he: 'ירש מהצ׳אט', ar: 'وراثة من الدردشة' },
  'mood.inheritFromChatHint': { ru: 'Использовать настроение из Обсуждений', en: 'Use mood from Discussions', he: 'השתמש במצב רוח מהדיונים', ar: 'استخدام المزاج من المناقشات' },
  
  // Tags
  'tags.title': { ru: 'Теги', en: 'Tags', he: 'תגיות', ar: 'الوسوم' },
  'tags.add': { ru: 'Добавить тег', en: 'Add tag', he: 'הוסף תגית', ar: 'إضافة وسم' },
  'tags.placeholder': { ru: 'Новый тег...', en: 'New tag...', he: 'תגית חדשה...', ar: 'وسم جديد...' },
  'tags.work': { ru: 'Работа', en: 'Work', he: 'עבודה', ar: 'عمل' },
  'tags.family': { ru: 'Семья', en: 'Family', he: 'משפחה', ar: 'عائلة' },
  'tags.health': { ru: 'Здоровье', en: 'Health', he: 'בריאות', ar: 'صحة' },
  'tags.hobby': { ru: 'Хобби', en: 'Hobby', he: 'תחביב', ar: 'هواية' },
  'tags.friends': { ru: 'Друзья', en: 'Friends', he: 'חברים', ar: 'أصدقاء' },
  'tags.study': { ru: 'Учёба', en: 'Study', he: 'לימודים', ar: 'دراسة' },
  'tags.rest': { ru: 'Отдых', en: 'Rest', he: 'מנוחה', ar: 'راحة' },
  'tags.sport': { ru: 'Спорт', en: 'Sport', he: 'ספורט', ar: 'رياضة' },
  'tags.suggestions': { ru: 'Предложения', en: 'Suggestions', he: 'הצעות', ar: 'اقتراحات' },
  'tags.acceptAll': { ru: 'Принять все', en: 'Accept all', he: 'קבל הכל', ar: 'قبول الكل' },
  'tags.confidence': { ru: 'уверенность', en: 'confidence', he: 'ביטחון', ar: 'ثقة' },
  'tags.autoTitle': { ru: 'Авто-теги', en: 'Auto Tags', he: 'תגיות אוטומטיות', ar: 'وسوم تلقائية' },
  'tags.autoHint': { ru: 'Предлагать теги на основе текста', en: 'Suggest tags based on text content', he: 'הצע תגיות על בסיס תוכן הטקסט', ar: 'اقتراح وسوم بناءً على محتوى النص' },
  
  // Search
  'search.title': { ru: 'Поиск', en: 'Search', he: 'חיפוש', ar: 'بحث' },
  'search.placeholder': { ru: 'Поиск по записям...', en: 'Search entries...', he: 'חפש ברשומות...', ar: 'البحث في المدخلات...' },
  'search.filterByTags': { ru: 'Фильтр по меткам', en: 'Filter by tags', he: 'סנן לפי תגיות', ar: 'تصفية حسب الوسوم' },
  'search.reset': { ru: 'Сбросить', en: 'Reset', he: 'איפוס', ar: 'إعادة تعيين' },
  'search.found': { ru: 'Найдено', en: 'Found', he: 'נמצאו', ar: 'تم العثور على' },
  'search.noResults': { ru: 'Ничего не найдено', en: 'No results', he: 'לא נמצאו תוצאות', ar: 'لا توجد نتائج' },
  'search.noResultsHint': { ru: 'Измените запрос или сбросьте фильтры', en: 'Try changing query or reset filters', he: 'נסה לשנות שאילתה או אפס מסננים', ar: 'حاول تغيير الاستعلام أو إعادة تعيين المرشحات' },
  'search.noEntries': { ru: 'Нет записей', en: 'No entries', he: 'אין רשומות', ar: 'لا توجد مدخلات' },
  'search.noEntriesHint': { ru: 'Создайте первую запись', en: 'Create your first entry', he: 'צור את הרשומה הראשונה שלך', ar: 'أنشئ أول مدخل لك' },
  
  // Calendar
  'calendar.title': { ru: 'Календарь', en: 'Calendar', he: 'לוח שנה', ar: 'التقويم' },
  'calendar.mon': { ru: 'Пн', en: 'Mo', he: 'ב׳', ar: 'ن' },
  'calendar.tue': { ru: 'Вт', en: 'Tu', he: 'ג׳', ar: 'ث' },
  'calendar.wed': { ru: 'Ср', en: 'We', he: 'ד׳', ar: 'ر' },
  'calendar.thu': { ru: 'Чт', en: 'Th', he: 'ה׳', ar: 'خ' },
  'calendar.fri': { ru: 'Пт', en: 'Fr', he: 'ו׳', ar: 'ج' },
  'calendar.sat': { ru: 'Сб', en: 'Sa', he: 'ש׳', ar: 'س' },
  'calendar.sun': { ru: 'Вс', en: 'Su', he: 'א׳', ar: 'ح' },
  // Month names
  'calendar.january': { ru: 'Январь', en: 'January', he: 'ינואר', ar: 'يناير' },
  'calendar.february': { ru: 'Февраль', en: 'February', he: 'פברואר', ar: 'فبراير' },
  'calendar.march': { ru: 'Март', en: 'March', he: 'מרץ', ar: 'مارس' },
  'calendar.april': { ru: 'Апрель', en: 'April', he: 'אפריל', ar: 'أبريل' },
  'calendar.may': { ru: 'Май', en: 'May', he: 'מאי', ar: 'مايو' },
  'calendar.june': { ru: 'Июнь', en: 'June', he: 'יוני', ar: 'يونيو' },
  'calendar.july': { ru: 'Июль', en: 'July', he: 'יולי', ar: 'يوليو' },
  'calendar.august': { ru: 'Август', en: 'August', he: 'אוגוסט', ar: 'أغسطس' },
  'calendar.september': { ru: 'Сентябрь', en: 'September', he: 'ספטמבר', ar: 'سبتمبر' },
  'calendar.october': { ru: 'Октябрь', en: 'October', he: 'אוקטובר', ar: 'أكتوبر' },
  'calendar.november': { ru: 'Ноябрь', en: 'November', he: 'נובמבר', ar: 'نوفمبر' },
  'calendar.december': { ru: 'Декабрь', en: 'December', he: 'דצמבר', ar: 'ديسمبر' },
  
  // Day view
  'day.noEntries': { ru: 'Записей нет', en: 'No entries', he: 'אין רשומות', ar: 'لا توجد مدخلات' },
  'day.noEntriesHint': { ru: 'В этот день записи не создавались', en: 'No entries were created this day', he: 'לא נוצרו רשומות ביום זה', ar: 'لم يتم إنشاء مدخلات في هذا اليوم' },
  'day.createEntry': { ru: 'Создать запись', en: 'Create entry', he: 'צור רשומה', ar: 'إنشاء مدخل' },
  
  // Settings
  'settings.title': { ru: 'Настройки', en: 'Settings', he: 'הגדרות', ar: 'إعدادات' },
  'settings.theme': { ru: 'Тема оформления', en: 'Theme', he: 'ערכת נושא', ar: 'المظهر' },
  'settings.themeLight': { ru: 'Светлая', en: 'Light', he: 'בהיר', ar: 'فاتح' },
  'settings.themeDark': { ru: 'Тёмная', en: 'Dark', he: 'כהה', ar: 'داكن' },
  'settings.themeSystem': { ru: 'Системная', en: 'System', he: 'מערכת', ar: 'النظام' },
  'settings.language': { ru: 'Язык', en: 'Language', he: 'שפה', ar: 'اللغة' },
  'settings.languageRu': { ru: 'Русский', en: 'Russian', he: 'רוסית', ar: 'روسي' },
  'settings.languageEn': { ru: 'English', en: 'English', he: 'אנגלית', ar: 'إنجليزي' },
  'settings.install': { ru: 'Установка', en: 'Installation', he: 'התקנה', ar: 'تثبيت' },
  'settings.installApp': { ru: 'Установить приложение', en: 'Install app', he: 'התקן אפליקציה', ar: 'تثبيت التطبيق' },
  'settings.installHint': { ru: 'Работает офлайн', en: 'Works offline', he: 'עובד אופליין', ar: 'يعمل بدون اتصال' },
  'settings.data': { ru: 'Данные', en: 'Data', he: 'נתונים', ar: 'البيانات' },
  'settings.storage': { ru: 'Хранилище', en: 'Storage', he: 'אחסון', ar: 'التخزين' },
  'settings.storageUsed': { ru: 'Использовано', en: 'Used', he: 'בשימוש', ar: 'مستخدم' },
  'settings.export': { ru: 'Экспорт данных', en: 'Export data', he: 'ייצא נתונים', ar: 'تصدير البيانات' },
  'settings.exportHint': { ru: 'Скачать все записи в JSON', en: 'Download all entries as JSON', he: 'הורד את כל הרשומות כ-JSON', ar: 'تحميل جميع المدخلات بتنسيق JSON' },
  'settings.exportSuccess': { ru: 'Данные экспортированы', en: 'Data exported', he: 'הנתונים יוצאו', ar: 'تم تصدير البيانات' },
  'settings.clearData': { ru: 'Очистить все данные', en: 'Clear all data', he: 'נקה את כל הנתונים', ar: 'مسح جميع البيانات' },
  'settings.clearDataConfirm': { ru: 'Удалить все данные?', en: 'Delete all data?', he: 'למחוק את כל הנתונים?', ar: 'حذف جميع البيانات؟' },
  'settings.clearDataDesc': { ru: 'Все записи и вложения будут удалены безвозвратно', en: 'All entries and attachments will be permanently deleted', he: 'כל הרשומות והקבצים המצורפים יימחקו לצמיתות', ar: 'سيتم حذف جميع المدخلات والمرفقات نهائياً' },
  'settings.clearDataSuccess': { ru: 'Все данные удалены', en: 'All data cleared', he: 'כל הנתונים נמחקו', ar: 'تم مسح جميع البيانات' },
  'settings.version': { ru: 'Версия', en: 'Version', he: 'גרסה', ar: 'الإصدار' },
  
  // AI - Sigil Assistant
  'ai.title': { ru: 'Сигил-ассистент', en: 'Sigil Assistant', he: 'עוזר סיגיל', ar: 'مساعد سيجيل' },
  'ai.sigilTitle': { ru: 'Сигил', en: 'Sigil', he: 'סיגיל', ar: 'سيجيل' },
  'ai.enabled': { ru: 'Включён', en: 'Active', he: 'פעיל', ar: 'نشط' },
  'ai.disabled': { ru: 'Отключён', en: 'Inactive', he: 'לא פעיל', ar: 'غير نشط' },
  'ai.strictPrivacy': { ru: 'Строгая приватность', en: 'Strict privacy', he: 'פרטיות קפדנית', ar: 'خصوصية صارمة' },
  'ai.strictPrivacyHint': { ru: 'Не цитировать дневник дословно', en: 'Never quote diary verbatim', he: 'לעולם לא לצטט את היומן מילה במילה', ar: 'لا تقتبس اليوميات حرفياً' },
  'ai.chatProfile': { ru: 'Профиль для чата', en: 'Chat profile', he: 'פרופיל צ׳אט', ar: 'ملف الدردشة' },
  'ai.bioProfile': { ru: 'Профиль для хроники', en: 'Chronicle profile', he: 'פרופיל כרוניקה', ar: 'ملف السجل' },
  'ai.testConnection': { ru: 'Проверить канал', en: 'Test channel', he: 'בדוק ערוץ', ar: 'اختبار القناة' },
  'ai.connectionSuccess': { ru: 'Канал установлен', en: 'Channel established', he: 'הערוץ נוצר', ar: 'تم إنشاء القناة' },
  'ai.connectionError': { ru: 'Сбой канала', en: 'Channel error', he: 'שגיאת ערוץ', ar: 'خطأ في القناة' },
  'ai.unavailable': { ru: 'Сигил недоступен', en: 'Sigil unavailable', he: 'סיגיל לא זמין', ar: 'سيجيل غير متاح' },
  'ai.unavailableHint': { ru: 'Проверьте подключение к сети', en: 'Check your network connection', he: 'בדוק את חיבור הרשת שלך', ar: 'تحقق من اتصالك بالشبكة' },
  'ai.chatDisabled': { ru: 'Оракул неактивен', en: 'Oracle inactive', he: 'אורקל לא פעיל', ar: 'أوراكل غير نشط' },
  'ai.chatDisabledHint': { ru: 'Активируйте Сигил в настройках', en: 'Activate Sigil in settings', he: 'הפעל סיגיל בהגדרות', ar: 'فعّل سيجيل في الإعدادات' },
  'ai.chatPlaceholder': { ru: 'Задайте вопрос о записях...', en: 'Ask about your entries...', he: 'שאל על הרשומות שלך...', ar: 'اسأل عن مدخلاتك...' },
  'ai.profile.economy': { ru: 'Эконом', en: 'Economy', he: 'חסכוני', ar: 'اقتصادي' },
  'ai.profile.fast': { ru: 'Быстро', en: 'Fast', he: 'מהיר', ar: 'سريع' },
  'ai.profile.balanced': { ru: 'Баланс', en: 'Balance', he: 'מאוזן', ar: 'متوازن' },
  'ai.profile.quality': { ru: 'Качество', en: 'Quality', he: 'איכות', ar: 'جودة' },
  'ai.profile.biography': { ru: 'Хроника', en: 'Chronicle', he: 'כרוניקה', ar: 'سجل' },
  'ai.cloudService': { ru: 'Облачный сервис', en: 'Cloud service', he: 'שירות ענן', ar: 'خدمة سحابية' },
  'ai.startConversation': { ru: 'Начните диалог', en: 'Start a conversation', he: 'התחל שיחה', ar: 'ابدأ محادثة' },
  'ai.startConversationHint': { ru: 'Сигил анализирует ваши записи по темам и настроению, не по вложениям', en: 'Sigil analyzes your entries by themes and mood, not attachments', he: 'סיגיל מנתח את הרשומות שלך לפי נושאים ומצב רוח, לא לפי קבצים מצורפים', ar: 'سيجيل يحلل مدخلاتك حسب الموضوعات والمزاج، وليس المرفقات' },
  'ai.profile': { ru: 'Профиль', en: 'Profile', he: 'פרופיל', ar: 'ملف' },
  
  // Biography - Chronicle
  'bio.title': { ru: 'Хроника дня', en: 'Day Chronicle', he: 'כרוניקת היום', ar: 'سجل اليوم' },
  'bio.sealTitle': { ru: 'Печать', en: 'Seal', he: 'חותם', ar: 'ختم' },
  'bio.generate': { ru: 'Создать хронику дня', en: 'Create day chronicle', he: 'צור כרוניקת יום', ar: 'إنشاء سجل اليوم' },
  'bio.generateNow': { ru: 'Создать хронику сейчас', en: 'Create chronicle now', he: 'צור כרוניקה עכשיו', ar: 'إنشاء السجل الآن' },
  'bio.generating': { ru: 'Создание...', en: 'Creating...', he: 'יוצר...', ar: 'جاري الإنشاء...' },
  'bio.success': { ru: 'Хроника готова', en: 'Chronicle ready', he: 'הכרוניקה מוכנה', ar: 'السجل جاهز' },
  'bio.error': { ru: 'Сбой создания хроники', en: 'Failed to create chronicle', he: 'נכשל ביצירת הכרוניקה', ar: 'فشل إنشاء السجل' },
  'bio.regenerate': { ru: 'Обновить хронику', en: 'Update chronicle', he: 'עדכן כרוניקה', ar: 'تحديث السجل' },
  'bio.highlights': { ru: 'Сводка', en: 'Summary', he: 'סיכום', ar: 'ملخص' },
  'bio.moments': { ru: 'Протокол дня', en: 'Day Protocol', he: 'פרוטוקול היום', ar: 'بروتوكول اليوم' },
  'bio.media': { ru: 'Связанные медиа', en: 'Related media', he: 'מדיה קשורה', ar: 'وسائط مرتبطة' },
  'bio.time': { ru: 'Время создания хроники', en: 'Chronicle time', he: 'זמן הכרוניקה', ar: 'وقت السجل' },
  'bio.timeHint': { ru: 'Когда предлагать создание', en: 'When to prompt creation', he: 'מתי להציע יצירה', ar: 'متى يتم الاقتراح' },
  'bio.pending': { ru: 'В очереди', en: 'Queued', he: 'בתור', ar: 'في الانتظار' },
  'bio.channelError': { ru: 'Сбой канала', en: 'Channel error', he: 'שגיאת ערוץ', ar: 'خطأ في القناة' },
  'bio.ready': { ru: 'Хроника дня готова', en: 'Day chronicle ready', he: 'כרוניקת היום מוכנה', ar: 'سجل اليوم جاهز' },
  'bio.view': { ru: 'Открыть', en: 'View', he: 'צפה', ar: 'عرض' },
  'bio.updateSeal': { ru: 'Обновить печать дня?', en: 'Update day seal?', he: 'לעדכן חותם יום?', ar: 'تحديث ختم اليوم؟' },
  'bio.updateSealHint': { ru: 'Хотите обновить хронику этого дня?', en: 'Would you like to update the chronicle?', he: 'האם לעדכן את הכרוניקה?', ar: 'هل تريد تحديث السجل؟' },
  'bio.update': { ru: 'Обновить', en: 'Update', he: 'עדכן', ar: 'تحديث' },
  'bio.later': { ru: 'Позже', en: 'Later', he: 'מאוחר יותר', ar: 'لاحقاً' },
  'bio.updating': { ru: 'Обновление...', en: 'Updating...', he: 'מעדכן...', ar: 'جاري التحديث...' },
  
  // 404
  'notFound.title': { ru: '404', en: '404', he: '404', ar: '404' },
  'notFound.message': { ru: 'Страница не найдена', en: 'Page not found', he: 'הדף לא נמצא', ar: 'الصفحة غير موجودة' },
  'notFound.back': { ru: 'На главную', en: 'Return to Home', he: 'חזור לדף הבית', ar: 'العودة للرئيسية' },
  
  // Media
  'media.photo': { ru: 'Фото', en: 'Photo', he: 'תמונה', ar: 'صورة' },
  'media.video': { ru: 'Видео', en: 'Video', he: 'וידאו', ar: 'فيديو' },
  'media.localStorageHint': { ru: 'Вложения хранятся локально на устройстве', en: 'Attachments are stored locally on this device', he: 'קבצים מצורפים נשמרים מקומית במכשיר זה', ar: 'المرفقات مخزنة محلياً على هذا الجهاز' },
  'media.audio': { ru: 'Аудио', en: 'Audio', he: 'אודיו', ar: 'صوت' },
  'media.dictation': { ru: 'Диктовка', en: 'Dictation', he: 'הכתבה', ar: 'إملاء' },
  'media.remove': { ru: 'Удалить', en: 'Remove', he: 'הסר', ar: 'إزالة' },
  'media.analyze': { ru: 'Анализировать', en: 'Analyze', he: 'נתח', ar: 'تحليل' },
  'media.analyzing': { ru: 'Анализ...', en: 'Analyzing...', he: 'מנתח...', ar: 'جاري التحليل...' },
  'media.analysisTitle': { ru: 'Разбор фото', en: 'Photo analysis', he: 'ניתוח תמונה', ar: 'تحليل الصورة' },
  'media.analysisError': { ru: 'Не удалось проанализировать', en: 'Analysis failed', he: 'הניתוח נכשל', ar: 'فشل التحليل' },
  
  // Consent
  'consent.photoAnalysis': { ru: 'Фото будет отправлено Сигилу для анализа. Продолжить?', en: 'Photo will be sent to Sigil for analysis. Continue?', he: 'התמונה תישלח לסיגיל לניתוח. להמשיך?', ar: 'سيتم إرسال الصورة إلى سيجيل للتحليل. متابعة؟' },
  'consent.photoAnalysisHint': { ru: 'Изображение обрабатывается на сервере и не сохраняется.', en: 'Image is processed on server and not stored.', he: 'התמונה מעובדת בשרת ולא נשמרת.', ar: 'الصورة تُعالج على الخادم ولا يتم تخزينها.' },
  'consent.continue': { ru: 'Продолжить', en: 'Continue', he: 'המשך', ar: 'متابعة' },
  
  // Privacy
  'privacy.title': { ru: 'Приватность', en: 'Privacy', he: 'פרטיות', ar: 'الخصوصية' },
  'privacy.strictBlocksMedia': { ru: 'Строгая приватность включена — анализ медиа отключён.', en: 'Strict privacy is enabled — media analysis is disabled.', he: 'פרטיות קפדנית מופעלת — ניתוח מדיה מושבת.', ar: 'الخصوصية الصارمة مفعّلة — تحليل الوسائط معطّل.' },
  'privacy.localData': { ru: 'Записи и вложения хранятся локально на устройстве (IndexedDB).', en: 'Entries and attachments are stored locally on device (IndexedDB).', he: 'רשומות וקבצים מצורפים נשמרים מקומית במכשיר (IndexedDB).', ar: 'المدخلات والمرفقات مخزنة محلياً على الجهاز (IndexedDB).' },
  'privacy.chatData': { ru: 'Чат отправляет в AI только то, что вы вводите в чат.', en: 'Chat sends to AI only what you type in chat.', he: 'הצ׳אט שולח ל-AI רק את מה שאתה מקליד בצ׳אט.', ar: 'الدردشة ترسل للذكاء الاصطناعي فقط ما تكتبه في الدردشة.' },
  'privacy.chronicleData': { ru: 'Хроника дня использует обобщённые темы/теги/настроение — без цитирования записей.', en: 'Day Chronicle uses summarized themes/tags/mood — without quoting entries.', he: 'כרוניקת היום משתמשת בנושאים/תגיות/מצב רוח מסוכמים — ללא ציטוט רשומות.', ar: 'سجل اليوم يستخدم موضوعات/وسوم/مزاج ملخصة — بدون اقتباس المدخلات.' },
  'privacy.photoData': { ru: 'Анализ фото (если используете) отправляет изображение в AI-сервис для обработки; изображение не сохраняется на сервере.', en: 'Photo analysis (if used) sends image to AI service for processing; image is not stored on server.', he: 'ניתוח תמונה (אם נעשה בו שימוש) שולח תמונה לשירות AI לעיבוד; התמונה לא נשמרת בשרת.', ar: 'تحليل الصور (إذا استُخدم) يرسل الصورة لخدمة الذكاء الاصطناعي للمعالجة؛ الصورة لا تُخزّن على الخادم.' },
  'privacy.strictMode': { ru: 'Строгая приватность отключает анализ медиа и запрещает цитирование.', en: 'Strict privacy disables media analysis and prohibits quoting.', he: 'פרטיות קפדנית משביתה ניתוח מדיה ואוסרת ציטוט.', ar: 'الخصوصية الصارمة تعطّل تحليل الوسائط وتمنع الاقتباس.' },
  
  // Misc
  'misc.copied': { ru: 'Скопировано', en: 'Copied', he: 'הועתק', ar: 'تم النسخ' },
  'misc.copy': { ru: 'Скопировать', en: 'Copy', he: 'העתק', ar: 'نسخ' },
  'misc.openDay': { ru: 'Открыть день', en: 'Open day', he: 'פתח יום', ar: 'فتح اليوم' },
  'misc.pastDate': { ru: 'прошлая дата', en: 'past date', he: 'תאריך עבר', ar: 'تاريخ سابق' },
  'misc.highlights': { ru: 'Главные моменты', en: 'Highlights', he: 'נקודות עיקריות', ar: 'أبرز النقاط' },
  
  // Receipts
  'receipts.exportReceipts': { ru: 'Экспорт чеков', en: 'Export Receipts', he: 'ייצא קבלות', ar: 'تصدير الإيصالات' },
  'receipts.exportItems': { ru: 'Экспорт товаров', en: 'Export Items', he: 'ייצא פריטים', ar: 'تصدير العناصر' },
  'receipts.linkToEntry': { ru: 'Привязать к записи', en: 'Link to Entry', he: 'קשר לרשומה', ar: 'ربط بمدخل' },
  'receipts.unlink': { ru: 'Отвязать', en: 'Unlink', he: 'בטל קישור', ar: 'إلغاء الربط' },
  'receipts.linkedEntry': { ru: 'Привязанная запись', en: 'Linked Entry', he: 'רשומה מקושרת', ar: 'مدخل مرتبط' },
  'receipts.openEntry': { ru: 'Открыть запись', en: 'Open Entry', he: 'פתח רשומה', ar: 'فتح المدخل' },
  'receipts.linkPickerTitle': { ru: 'Привязать к записи', en: 'Link to Entry', he: 'קשר לרשומה', ar: 'ربط بمدخل' },
  'receipts.searchPlaceholder': { ru: 'Поиск по записям...', en: 'Search entries...', he: 'חפש ברשומות...', ar: 'البحث في المدخلات...' },
  'receipts.preparingCsv': { ru: 'Подготовка CSV...', en: 'Preparing CSV...', he: 'מכין CSV...', ar: 'جاري تحضير CSV...' },
  'receipts.csvDownloaded': { ru: 'CSV скачан', en: 'CSV downloaded', he: 'CSV הורד', ar: 'تم تحميل CSV' },
  'receipts.noDataToExport': { ru: 'Нет данных для экспорта', en: 'No data to export', he: 'אין נתונים לייצוא', ar: 'لا توجد بيانات للتصدير' },
  'receipts.linkedReceipts': { ru: 'Привязанные чеки', en: 'Linked Receipts', he: 'קבלות מקושרות', ar: 'إيصالات مرتبطة' },
  'receipts.noLinkedReceipts': { ru: 'Нет привязанных чеков', en: 'No linked receipts', he: 'אין קבלות מקושרות', ar: 'لا توجد إيصالات مرتبطة' },
  'receipts.scanAndLink': { ru: 'Сканировать и привязать', en: 'Scan & Link', he: 'סרוק וקשר', ar: 'مسح وربط' },
  'receipts.diagnostics': { ru: 'Диагностика сканера', en: 'Scanner Diagnostics', he: 'אבחון סורק', ar: 'تشخيص الماسح' },
  'receipts.exportDiagnostics': { ru: 'Экспорт логов', en: 'Export Logs', he: 'ייצא יומנים', ar: 'تصدير السجلات' },
  'receipts.diagnosticsExported': { ru: 'Логи экспортированы', en: 'Logs exported', he: 'יומנים יוצאו', ar: 'تم تصدير السجلات' },
  'receipts.noDiagnostics': { ru: 'Нет логов', en: 'No logs', he: 'אין יומנים', ar: 'لا توجد سجلات' },
  'receipts.scanMode': { ru: 'Режим сканирования', en: 'Scan Mode', he: 'מצב סריקה', ar: 'وضع المسح' },
  'receipts.scanAccurate': { ru: 'Точно', en: 'Accurate', he: 'מדויק', ar: 'دقيق' },
  'receipts.scanFast': { ru: 'Быстро', en: 'Fast', he: 'מהיר', ar: 'سريع' },
  'receipts.scanAccurateDesc': { ru: 'Лучшее качество OCR', en: 'Best OCR quality', he: 'איכות OCR הטובה ביותר', ar: 'أفضل جودة OCR' },
  'receipts.scanFastDesc': { ru: 'Быстрее, но менее точно', en: 'Faster, but less accurate', he: 'מהיר יותר, אך פחות מדויק', ar: 'أسرع، ولكن أقل دقة' },
  'receipts.preprocessing': { ru: 'Улучшить для распознавания', en: 'Enhance for OCR', he: 'שפר ל-OCR', ar: 'تحسين لـ OCR' },
  'receipts.scannedWith': { ru: 'Распознано', en: 'Scanned with', he: 'נסרק עם', ar: 'تم المسح بـ' },
  'receipts.modelPro': { ru: 'Pro (точный)', en: 'Pro (accurate)', he: 'Pro (מדויק)', ar: 'Pro (دقيق)' },
  'receipts.modelFlash': { ru: 'Flash (быстрый)', en: 'Flash (fast)', he: 'Flash (מהיר)', ar: 'Flash (سريع)' },
  
  // Chat multimodal
  'chat.sendPhoto': { ru: 'Отправить фото', en: 'Send photo', he: 'שלח תמונה', ar: 'إرسال صورة' },
  'chat.photoAttached': { ru: 'Фото прикреплено', en: 'Photo attached', he: 'תמונה מצורפת', ar: 'صورة مرفقة' },
  'chat.strictPrivacyBlocks': { ru: 'Строгая приватность включена — отправка изображений отключена', en: 'Strict privacy enabled — image sending disabled', he: 'פרטיות קפדנית מופעלת — שליחת תמונות מושבתת', ar: 'الخصوصية الصارمة مفعّلة — إرسال الصور معطّل' },
  'chat.fromDiary': { ru: 'Из дневника', en: 'From diary', he: 'מהיומן', ar: 'من اليوميات' },
  'chat.fromDiaryTitle': { ru: 'Фото из дневника', en: 'Photos from diary', he: 'תמונות מהיומן', ar: 'صور من اليوميات' },
  'chat.fromDiaryHint': { ru: 'Выберите фото для отправки в чат', en: 'Select a photo to send in chat', he: 'בחר תמונה לשליחה בצ׳אט', ar: 'اختر صورة لإرسالها في الدردشة' },
  'chat.noSavedPhotos': { ru: 'Нет сохранённых фото', en: 'No saved photos', he: 'אין תמונות שמורות', ar: 'لا توجد صور محفوظة' },
  'chat.noSavedPhotosHint': { ru: 'Добавьте фото к записям дневника', en: 'Add photos to your diary entries', he: 'הוסף תמונות לרשומות היומן שלך', ar: 'أضف صوراً إلى مدخلات يومياتك' },
  
  // AI PIN Access
  'aiPin.title': { ru: 'Доступ к ИИ', en: 'AI Access', he: 'גישה ל-AI', ar: 'الوصول للذكاء الاصطناعي' },
  'aiPin.description': { ru: 'Введите 4-значный PIN для активации функций ИИ', en: 'Enter 4-digit PIN to enable AI features', he: 'הזן PIN בן 4 ספרות להפעלת תכונות AI', ar: 'أدخل رمز PIN مكون من 4 أرقام لتفعيل ميزات الذكاء الاصطناعي' },
  'aiPin.verifying': { ru: 'Проверка...', en: 'Verifying...', he: 'מאמת...', ar: 'جاري التحقق...' },
  'aiPin.success': { ru: 'Доступ открыт!', en: 'Access granted!', he: 'הגישה ניתנה!', ar: 'تم منح الوصول!' },
  'aiPin.invalidPin': { ru: 'Неверный PIN-код', en: 'Invalid PIN', he: 'PIN לא תקין', ar: 'رمز PIN غير صالح' },
  'aiPin.networkError': { ru: 'Ошибка сети', en: 'Network error', he: 'שגיאת רשת', ar: 'خطأ في الشبكة' },
  'aiPin.notConfigured': { ru: 'Сервис не настроен', en: 'Service not configured', he: 'השירות לא מוגדר', ar: 'الخدمة غير مكوّنة' },
  'aiPin.error': { ru: 'Ошибка проверки', en: 'Verification error', he: 'שגיאת אימות', ar: 'خطأ في التحقق' },
  'aiPin.required': { ru: 'Требуется PIN', en: 'PIN required', he: 'נדרש PIN', ar: 'مطلوب رمز PIN' },
  'aiPin.requiredHint': { ru: 'Введите PIN для доступа к функциям ИИ', en: 'Enter PIN to access AI features', he: 'הזן PIN לגישה לתכונות AI', ar: 'أدخل رمز PIN للوصول لميزات الذكاء الاصطناعي' },
  'aiPin.enter': { ru: 'Ввести PIN', en: 'Enter PIN', he: 'הזן PIN', ar: 'إدخال رمز PIN' },
  'aiPin.validUntil': { ru: 'Доступ до', en: 'Access until', he: 'גישה עד', ar: 'الوصول حتى' },
  'aiPin.revoke': { ru: 'Сбросить доступ', en: 'Revoke access', he: 'בטל גישה', ar: 'إلغاء الوصول' },
  'aiPin.expiresIn': { ru: 'Истекает через', en: 'Expires in', he: 'פג תוקף בעוד', ar: 'ينتهي خلال' },
  'aiPin.sessionExpired': { ru: 'Сессия ИИ истекла', en: 'AI session expired', he: 'פג תוקף הפגישה של AI', ar: 'انتهت جلسة الذكاء الاصطناعي' },
  'aiPin.authRequired': { ru: 'Требуется авторизация ИИ', en: 'AI authorization required', he: 'נדרש אישור AI', ar: 'مطلوب تفويض الذكاء الاصطناعي' },
  'aiPin.cancelled': { ru: 'Авторизация отменена', en: 'Authorization cancelled', he: 'האישור בוטל', ar: 'تم إلغاء التفويض' },
  'aiPin.invalidToken': { ru: 'Недействительный токен', en: 'Invalid token', he: 'טוקן לא תקין', ar: 'رمز غير صالح' },
  'aiPin.serviceNotConfigured': { ru: 'Сервис ИИ не настроен', en: 'AI service not configured', he: 'שירות AI לא מוגדר', ar: 'خدمة الذكاء الاصطناعي غير مكوّنة' },
  'aiPin.retrying': { ru: 'Повторный запрос...', en: 'Retrying...', he: 'מנסה שוב...', ar: 'جاري إعادة المحاولة...' },
  'aiPin.requestId': { ru: 'ID запроса', en: 'Request ID', he: 'מזהה בקשה', ar: 'معرّف الطلب' },
  
  // Auto-screenshot
  'autoScreenshot.title': { ru: 'Автоскриншот', en: 'Auto-screenshot', he: 'צילום מסך אוטומטי', ar: 'لقطة شاشة تلقائية' },
  'autoScreenshot.description': { ru: 'Автоматически захватывать экран при открытии чата', en: 'Automatically capture screen when opening chat', he: 'צלם מסך אוטומטית בפתיחת צ׳אט', ar: 'التقاط الشاشة تلقائياً عند فتح الدردشة' },
  'autoScreenshot.capturing': { ru: 'Захват экрана...', en: 'Capturing screen...', he: 'מצלם מסך...', ar: 'جاري التقاط الشاشة...' },
  'autoScreenshot.preview': { ru: 'Превью скриншота', en: 'Screenshot preview', he: 'תצוגה מקדימה של צילום מסך', ar: 'معاينة لقطة الشاشة' },
  'autoScreenshot.send': { ru: 'Отправить', en: 'Send', he: 'שלח', ar: 'إرسال' },
  'autoScreenshot.dismiss': { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  'autoScreenshot.edit': { ru: 'Редактировать', en: 'Edit', he: 'ערוך', ar: 'تعديل' },
  'autoScreenshot.failed': { ru: 'Не удалось захватить экран', en: 'Failed to capture screen', he: 'צילום המסך נכשל', ar: 'فشل التقاط الشاشة' },
  'autoScreenshot.blurPrivate': { ru: 'Размывать приватные поля', en: 'Blur private fields', he: 'טשטש שדות פרטיים', ar: 'تمويه الحقول الخاصة' },
  'autoScreenshot.blurPrivateHint': { ru: 'Скрывать пароли и PIN на скриншоте', en: 'Hide passwords and PINs in screenshot', he: 'הסתר סיסמאות ו-PIN בצילום מסך', ar: 'إخفاء كلمات المرور وأرقام PIN في لقطة الشاشة' },
  
  // Navigation - Discussions
  'nav.discussions': { ru: 'Обсуждения', en: 'Discussions', he: 'דיונים', ar: 'مناقشات' },
  
  // Discussions List
  'discussions.title': { ru: 'Обсуждения', en: 'Discussions', he: 'דיונים', ar: 'مناقشات' },
  'discussions.new': { ru: 'Новое', en: 'New', he: 'חדש', ar: 'جديد' },
  'discussions.empty': { ru: 'Нет обсуждений', en: 'No discussions', he: 'אין דיונים', ar: 'لا توجد مناقشات' },
  'discussions.emptyHint': { ru: 'Выберите записи и начните обсуждение', en: 'Select entries and start discussing', he: 'בחר רשומות והתחל לדון', ar: 'اختر مدخلات وابدأ المناقشة' },
  'discussions.delete': { ru: 'Удалить', en: 'Delete', he: 'מחק', ar: 'حذف' },
  'discussions.deleteConfirm': { ru: 'Удалить обсуждение?', en: 'Delete discussion?', he: 'למחוק דיון?', ar: 'حذف المناقشة؟' },
  'discussions.pin': { ru: 'Закрепить', en: 'Pin', he: 'הצמד', ar: 'تثبيت' },
  'discussions.unpin': { ru: 'Открепить', en: 'Unpin', he: 'בטל הצמדה', ar: 'إلغاء التثبيت' },
  
  // Discussion Chat
  'discussion.context': { ru: 'Контекст', en: 'Context', he: 'הקשר', ar: 'السياق' },
  'discussion.addFromToday': { ru: 'Добавить из записей', en: 'Add from entries', he: 'הוסף מרשומות', ar: 'إضافة من المدخلات' },
  'discussion.sources': { ru: 'Источники', en: 'Sources', he: 'מקורות', ar: 'المصادر' },
  'discussion.openSource': { ru: 'Открыть', en: 'Open', he: 'פתח', ar: 'فتح' },
  'discussion.findInNotes': { ru: 'Найти в записях', en: 'Find in notes', he: 'מצא ברשימות', ar: 'البحث في الملاحظات' },
  'discussion.offline': { ru: 'Офлайн: ИИ недоступен', en: 'Offline: AI unavailable', he: 'אופליין: AI לא זמין', ar: 'غير متصل: الذكاء الاصطناعي غير متاح' },
  'discussion.loadingContext': { ru: 'Загрузка контекста...', en: 'Loading context...', he: 'טוען הקשר...', ar: 'جاري تحميل السياق...' },
  'discussion.copyDraft': { ru: 'Скопировать', en: 'Copy', he: 'העתק', ar: 'نسخ' },
  'discussion.placeholder': { ru: 'Спросите о выбранных записях...', en: 'Ask about selected entries...', he: 'שאל על הרשומות שנבחרו...', ar: 'اسأل عن المدخلات المختارة...' },
  'discussion.newSession': { ru: 'Новое обсуждение', en: 'New discussion', he: 'דיון חדש', ar: 'مناقشة جديدة' },
  'discussion.sending': { ru: 'Отправка...', en: 'Sending...', he: 'שולח...', ar: 'جاري الإرسال...' },
  'discussion.error': { ru: 'Ошибка', en: 'Error', he: 'שגיאה', ar: 'خطأ' },
  
  // Discussion Modes
  'mode.discuss': { ru: 'Обсудить', en: 'Discuss', he: 'דון', ar: 'ناقش' },
  'mode.analyze': { ru: 'Анализ', en: 'Analyze', he: 'נתח', ar: 'حلل' },
  'mode.draft': { ru: 'Черновик', en: 'Draft', he: 'טיוטה', ar: 'مسودة' },
  'mode.compute': { ru: 'Расчёт', en: 'Compute', he: 'חשב', ar: 'حساب' },
  'mode.plan': { ru: 'План', en: 'Plan', he: 'תוכנית', ar: 'خطة' },
  
  // Today - Selection
  'today.select': { ru: 'Выбрать', en: 'Select', he: 'בחר', ar: 'اختيار' },
  'today.cancel': { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  'today.discuss': { ru: 'Обсудить', en: 'Discuss', he: 'דון', ar: 'ناقش' },
  
} as const;

export type TranslationKey = keyof typeof translations;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'daybook-language';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ru' || saved === 'en' || saved === 'he' || saved === 'ar') return saved;
      // Auto-detect from browser
      const browserLang = navigator.language.slice(0, 2);
      if (browserLang === 'ru') return 'ru';
      if (browserLang === 'he') return 'he';
      if (browserLang === 'ar') return 'ar';
      return 'en';
    }
    return 'ru';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const t = (key: TranslationKey): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }
    // Fallback to English if translation not available for RTL languages
    const text = translation[language] as string | undefined;
    if (text === undefined) {
      return (translation['en'] || translation['ru'] || key) as string;
    }
    return text;
  };

  // Set document direction and language for RTL support
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL(language) ? 'rtl' : 'ltr';
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

// Helper to get localized date format
export function getDateLocale(language: Language) {
  return language === 'ru' ? 'ru' : 'en-US';
}
