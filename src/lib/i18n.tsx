import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ru' | 'en';

// Translation keys - single source of truth for all UI strings
export const translations = {
  // Common
  'app.name': { ru: 'Магический блокнот', en: 'Magic Notebook' },
  'app.subtitle': { ru: 'Записи • Медиа • Хроника дня', en: 'Entries • Media • Day Chronicle' },
  'app.tagline': { ru: 'Записи • Медиа • Хроника дня', en: 'Entries • Media • Day Chronicle' },
  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.delete': { ru: 'Удалить', en: 'Delete' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.search': { ru: 'Поиск', en: 'Search' },
  'common.settings': { ru: 'Настройки', en: 'Settings' },
  'common.loading': { ru: 'Загрузка...', en: 'Loading...' },
  'common.error': { ru: 'Сбой', en: 'Error' },
  'common.success': { ru: 'Готово', en: 'Success' },
  'common.confirm': { ru: 'Подтвердить', en: 'Confirm' },
  'common.restore': { ru: 'Восстановить', en: 'Restore' },
  'common.discard': { ru: 'Отменить', en: 'Discard' },
  
  // Navigation
  'nav.today': { ru: 'Сегодня', en: 'Today' },
  'nav.calendar': { ru: 'Календарь', en: 'Calendar' },
  'nav.search': { ru: 'Поиск', en: 'Search' },
  'nav.chat': { ru: 'Оракул', en: 'Oracle' },
  'nav.settings': { ru: 'Настройки', en: 'Settings' },
  
  // Today page
  'today.noEntries': { ru: 'Записей пока нет', en: 'No entries yet' },
  'today.entry': { ru: 'запись', en: 'entry' },
  'today.entries2_4': { ru: 'записи', en: 'entries' },
  'today.entries5_': { ru: 'записей', en: 'entries' },
  'today.startDay': { ru: 'Открой день', en: 'Start your day' },
  'today.startDayHint': { ru: 'Нажми на книгу или + чтобы добавить первую запись', en: 'Tap the book or + to add your first entry' },
  
  // Entry
  'entry.new': { ru: 'Новая запись', en: 'New Entry' },
  'entry.edit': { ru: 'Редактировать', en: 'Edit Entry' },
  'entry.empty': { ru: 'Пустая запись', en: 'Empty entry' },
  'entry.placeholder': { ru: 'Что произошло сегодня?', en: 'What happened today?' },
  'entry.private': { ru: 'Приватная запись', en: 'Private entry' },
  'entry.privateDesc': { ru: 'Скрыта от анализа', en: 'Hidden from analysis' },
  'entry.saved': { ru: 'Запись сохранена', en: 'Entry saved' },
  'entry.saveFailed': { ru: 'Не удалось сохранить запись', en: 'Failed to save entry' },
  'entry.deleted': { ru: 'Запись удалена', en: 'Entry deleted' },
  'entry.deleteConfirm': { ru: 'Удалить запись?', en: 'Delete entry?' },
  'entry.deleteDesc': { ru: 'Это действие нельзя отменить', en: 'This action cannot be undone' },
  
  // Draft
  'draft.found': { ru: 'Найден черновик', en: 'Draft found' },
  'draft.foundDesc': { ru: 'Восстановить несохранённые изменения?', en: 'Restore unsaved changes?' },
  'draft.restored': { ru: 'Черновик восстановлен', en: 'Draft restored' },
  'draft.discarded': { ru: 'Черновик удалён', en: 'Draft discarded' },
  
  // Mood
  'mood.title': { ru: 'Настроение', en: 'Mood' },
  'mood.1': { ru: 'Критично', en: 'Critical' },
  'mood.2': { ru: 'Тяжело', en: 'Rough' },
  'mood.3': { ru: 'Ровно', en: 'Steady' },
  'mood.4': { ru: 'Хорошо', en: 'Good' },
  'mood.5': { ru: 'Отлично', en: 'Great' },
  'mood.autoTitle': { ru: 'Авто-настроение', en: 'Auto Mood' },
  'mood.autoHint': { ru: 'Определять настроение по тексту записи', en: 'Detect mood from entry text' },
  'mood.liveSuggestions': { ru: 'Живые подсказки', en: 'Live Suggestions' },
  'mood.liveSuggestionsHint': { ru: 'Показывать подсказки во время ввода', en: 'Show suggestions while typing' },
  'mood.inheritFromChat': { ru: 'Наследовать из чата', en: 'Inherit from Chat' },
  'mood.inheritFromChatHint': { ru: 'Использовать настроение из Обсуждений', en: 'Use mood from Discussions' },
  
  // Tags
  'tags.title': { ru: 'Теги', en: 'Tags' },
  'tags.add': { ru: 'Добавить тег', en: 'Add tag' },
  'tags.placeholder': { ru: 'Новый тег...', en: 'New tag...' },
  'tags.work': { ru: 'Работа', en: 'Work' },
  'tags.family': { ru: 'Семья', en: 'Family' },
  'tags.health': { ru: 'Здоровье', en: 'Health' },
  'tags.hobby': { ru: 'Хобби', en: 'Hobby' },
  'tags.friends': { ru: 'Друзья', en: 'Friends' },
  'tags.study': { ru: 'Учёба', en: 'Study' },
  'tags.rest': { ru: 'Отдых', en: 'Rest' },
  'tags.sport': { ru: 'Спорт', en: 'Sport' },
  'tags.suggestions': { ru: 'Предложения', en: 'Suggestions' },
  'tags.acceptAll': { ru: 'Принять все', en: 'Accept all' },
  'tags.confidence': { ru: 'уверенность', en: 'confidence' },
  'tags.autoTitle': { ru: 'Авто-теги', en: 'Auto Tags' },
  'tags.autoHint': { ru: 'Предлагать теги на основе текста', en: 'Suggest tags based on text content' },
  
  // Search
  'search.title': { ru: 'Поиск', en: 'Search' },
  'search.placeholder': { ru: 'Поиск по записям...', en: 'Search entries...' },
  'search.filterByTags': { ru: 'Фильтр по меткам', en: 'Filter by tags' },
  'search.reset': { ru: 'Сбросить', en: 'Reset' },
  'search.found': { ru: 'Найдено', en: 'Found' },
  'search.noResults': { ru: 'Ничего не найдено', en: 'No results' },
  'search.noResultsHint': { ru: 'Измените запрос или сбросьте фильтры', en: 'Try changing query or reset filters' },
  'search.noEntries': { ru: 'Нет записей', en: 'No entries' },
  'search.noEntriesHint': { ru: 'Создайте первую запись', en: 'Create your first entry' },
  
  // Calendar
  'calendar.title': { ru: 'Календарь', en: 'Calendar' },
  'calendar.mon': { ru: 'Пн', en: 'Mo' },
  'calendar.tue': { ru: 'Вт', en: 'Tu' },
  'calendar.wed': { ru: 'Ср', en: 'We' },
  'calendar.thu': { ru: 'Чт', en: 'Th' },
  'calendar.fri': { ru: 'Пт', en: 'Fr' },
  'calendar.sat': { ru: 'Сб', en: 'Sa' },
  'calendar.sun': { ru: 'Вс', en: 'Su' },
  // Month names
  'calendar.january': { ru: 'Январь', en: 'January' },
  'calendar.february': { ru: 'Февраль', en: 'February' },
  'calendar.march': { ru: 'Март', en: 'March' },
  'calendar.april': { ru: 'Апрель', en: 'April' },
  'calendar.may': { ru: 'Май', en: 'May' },
  'calendar.june': { ru: 'Июнь', en: 'June' },
  'calendar.july': { ru: 'Июль', en: 'July' },
  'calendar.august': { ru: 'Август', en: 'August' },
  'calendar.september': { ru: 'Сентябрь', en: 'September' },
  'calendar.october': { ru: 'Октябрь', en: 'October' },
  'calendar.november': { ru: 'Ноябрь', en: 'November' },
  'calendar.december': { ru: 'Декабрь', en: 'December' },
  
  // Day view
  'day.noEntries': { ru: 'Записей нет', en: 'No entries' },
  'day.noEntriesHint': { ru: 'В этот день записи не создавались', en: 'No entries were created this day' },
  'day.createEntry': { ru: 'Создать запись', en: 'Create entry' },
  
  // Settings
  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.theme': { ru: 'Тема оформления', en: 'Theme' },
  'settings.themeLight': { ru: 'Светлая', en: 'Light' },
  'settings.themeDark': { ru: 'Тёмная', en: 'Dark' },
  'settings.themeSystem': { ru: 'Системная', en: 'System' },
  'settings.language': { ru: 'Язык', en: 'Language' },
  'settings.languageRu': { ru: 'Русский', en: 'Russian' },
  'settings.languageEn': { ru: 'English', en: 'English' },
  'settings.install': { ru: 'Установка', en: 'Installation' },
  'settings.installApp': { ru: 'Установить приложение', en: 'Install app' },
  'settings.installHint': { ru: 'Работает офлайн', en: 'Works offline' },
  'settings.data': { ru: 'Данные', en: 'Data' },
  'settings.storage': { ru: 'Хранилище', en: 'Storage' },
  'settings.storageUsed': { ru: 'Использовано', en: 'Used' },
  'settings.export': { ru: 'Экспорт данных', en: 'Export data' },
  'settings.exportHint': { ru: 'Скачать все записи в JSON', en: 'Download all entries as JSON' },
  'settings.exportSuccess': { ru: 'Данные экспортированы', en: 'Data exported' },
  'settings.clearData': { ru: 'Очистить все данные', en: 'Clear all data' },
  'settings.clearDataConfirm': { ru: 'Удалить все данные?', en: 'Delete all data?' },
  'settings.clearDataDesc': { ru: 'Все записи и вложения будут удалены безвозвратно', en: 'All entries and attachments will be permanently deleted' },
  'settings.clearDataSuccess': { ru: 'Все данные удалены', en: 'All data cleared' },
  'settings.version': { ru: 'Версия', en: 'Version' },
  
  // AI - Sigil Assistant
  'ai.title': { ru: 'Сигил-ассистент', en: 'Sigil Assistant' },
  'ai.sigilTitle': { ru: 'Сигил', en: 'Sigil' },
  'ai.enabled': { ru: 'Включён', en: 'Active' },
  'ai.disabled': { ru: 'Отключён', en: 'Inactive' },
  'ai.strictPrivacy': { ru: 'Строгая приватность', en: 'Strict privacy' },
  'ai.strictPrivacyHint': { ru: 'Не цитировать дневник дословно', en: 'Never quote diary verbatim' },
  'ai.chatProfile': { ru: 'Профиль для чата', en: 'Chat profile' },
  'ai.bioProfile': { ru: 'Профиль для хроники', en: 'Chronicle profile' },
  'ai.testConnection': { ru: 'Проверить канал', en: 'Test channel' },
  'ai.connectionSuccess': { ru: 'Канал установлен', en: 'Channel established' },
  'ai.connectionError': { ru: 'Сбой канала', en: 'Channel error' },
  'ai.unavailable': { ru: 'Сигил недоступен', en: 'Sigil unavailable' },
  'ai.unavailableHint': { ru: 'Проверьте подключение к сети', en: 'Check your network connection' },
  'ai.chatDisabled': { ru: 'Оракул неактивен', en: 'Oracle inactive' },
  'ai.chatDisabledHint': { ru: 'Активируйте Сигил в настройках', en: 'Activate Sigil in settings' },
  'ai.chatPlaceholder': { ru: 'Задайте вопрос о записях...', en: 'Ask about your entries...' },
  'ai.profile.economy': { ru: 'Эконом', en: 'Economy' },
  'ai.profile.fast': { ru: 'Быстро', en: 'Fast' },
  'ai.profile.balanced': { ru: 'Баланс', en: 'Balance' },
  'ai.profile.quality': { ru: 'Качество', en: 'Quality' },
  'ai.profile.biography': { ru: 'Хроника', en: 'Chronicle' },
  'ai.cloudService': { ru: 'Облачный сервис', en: 'Cloud service' },
  'ai.startConversation': { ru: 'Начните диалог', en: 'Start a conversation' },
  'ai.startConversationHint': { ru: 'Сигил анализирует ваши записи по темам и настроению, не по вложениям', en: 'Sigil analyzes your entries by themes and mood, not attachments' },
  'ai.profile': { ru: 'Профиль', en: 'Profile' },
  
  // Biography - Chronicle
  'bio.title': { ru: 'Хроника дня', en: 'Day Chronicle' },
  'bio.sealTitle': { ru: 'Печать', en: 'Seal' },
  'bio.generate': { ru: 'Создать хронику дня', en: 'Create day chronicle' },
  'bio.generateNow': { ru: 'Создать хронику сейчас', en: 'Create chronicle now' },
  'bio.generating': { ru: 'Создание...', en: 'Creating...' },
  'bio.success': { ru: 'Хроника готова', en: 'Chronicle ready' },
  'bio.error': { ru: 'Сбой создания хроники', en: 'Failed to create chronicle' },
  'bio.regenerate': { ru: 'Обновить хронику', en: 'Update chronicle' },
  'bio.highlights': { ru: 'Сводка', en: 'Summary' },
  'bio.moments': { ru: 'Протокол дня', en: 'Day Protocol' },
  'bio.media': { ru: 'Связанные медиа', en: 'Related media' },
  'bio.time': { ru: 'Время создания хроники', en: 'Chronicle time' },
  'bio.timeHint': { ru: 'Когда предлагать создание', en: 'When to prompt creation' },
  'bio.pending': { ru: 'В очереди', en: 'Queued' },
  'bio.channelError': { ru: 'Сбой канала', en: 'Channel error' },
  'bio.ready': { ru: 'Хроника дня готова', en: 'Day chronicle ready' },
  'bio.view': { ru: 'Открыть', en: 'View' },
  'bio.updateSeal': { ru: 'Обновить печать дня?', en: 'Update day seal?' },
  'bio.updateSealHint': { ru: 'Хотите обновить хронику этого дня?', en: 'Would you like to update the chronicle?' },
  'bio.update': { ru: 'Обновить', en: 'Update' },
  'bio.later': { ru: 'Позже', en: 'Later' },
  'bio.updating': { ru: 'Обновление...', en: 'Updating...' },
  
  // 404
  'notFound.title': { ru: '404', en: '404' },
  'notFound.message': { ru: 'Страница не найдена', en: 'Page not found' },
  'notFound.back': { ru: 'На главную', en: 'Return to Home' },
  
  // Media
  'media.photo': { ru: 'Фото', en: 'Photo' },
  'media.video': { ru: 'Видео', en: 'Video' },
  'media.localStorageHint': { ru: 'Вложения хранятся локально на устройстве', en: 'Attachments are stored locally on this device' },
  'media.audio': { ru: 'Аудио', en: 'Audio' },
  'media.dictation': { ru: 'Диктовка', en: 'Dictation' },
  'media.remove': { ru: 'Удалить', en: 'Remove' },
  'media.analyze': { ru: 'Анализировать', en: 'Analyze' },
  'media.analyzing': { ru: 'Анализ...', en: 'Analyzing...' },
  'media.analysisTitle': { ru: 'Разбор фото', en: 'Photo analysis' },
  'media.analysisError': { ru: 'Не удалось проанализировать', en: 'Analysis failed' },
  
  // Consent
  'consent.photoAnalysis': { ru: 'Фото будет отправлено Сигилу для анализа. Продолжить?', en: 'Photo will be sent to Sigil for analysis. Continue?' },
  'consent.photoAnalysisHint': { ru: 'Изображение обрабатывается на сервере и не сохраняется.', en: 'Image is processed on server and not stored.' },
  'consent.continue': { ru: 'Продолжить', en: 'Continue' },
  
  // Privacy
  'privacy.title': { ru: 'Приватность', en: 'Privacy' },
  'privacy.strictBlocksMedia': { ru: 'Строгая приватность включена — анализ медиа отключён.', en: 'Strict privacy is enabled — media analysis is disabled.' },
  'privacy.localData': { ru: 'Записи и вложения хранятся локально на устройстве (IndexedDB).', en: 'Entries and attachments are stored locally on device (IndexedDB).' },
  'privacy.chatData': { ru: 'Чат отправляет в AI только то, что вы вводите в чат.', en: 'Chat sends to AI only what you type in chat.' },
  'privacy.chronicleData': { ru: 'Хроника дня использует обобщённые темы/теги/настроение — без цитирования записей.', en: 'Day Chronicle uses summarized themes/tags/mood — without quoting entries.' },
  'privacy.photoData': { ru: 'Анализ фото (если используете) отправляет изображение в AI-сервис для обработки; изображение не сохраняется на сервере.', en: 'Photo analysis (if used) sends image to AI service for processing; image is not stored on server.' },
  'privacy.strictMode': { ru: 'Строгая приватность отключает анализ медиа и запрещает цитирование.', en: 'Strict privacy disables media analysis and prohibits quoting.' },
  
  // Misc
  'misc.copied': { ru: 'Скопировано', en: 'Copied' },
  'misc.copy': { ru: 'Скопировать', en: 'Copy' },
  'misc.openDay': { ru: 'Открыть день', en: 'Open day' },
  'misc.pastDate': { ru: 'прошлая дата', en: 'past date' },
  'misc.highlights': { ru: 'Главные моменты', en: 'Highlights' },
  
  // Receipts
  'receipts.exportReceipts': { ru: 'Экспорт чеков', en: 'Export Receipts' },
  'receipts.exportItems': { ru: 'Экспорт товаров', en: 'Export Items' },
  'receipts.linkToEntry': { ru: 'Привязать к записи', en: 'Link to Entry' },
  'receipts.unlink': { ru: 'Отвязать', en: 'Unlink' },
  'receipts.linkedEntry': { ru: 'Привязанная запись', en: 'Linked Entry' },
  'receipts.openEntry': { ru: 'Открыть запись', en: 'Open Entry' },
  'receipts.linkPickerTitle': { ru: 'Привязать к записи', en: 'Link to Entry' },
  'receipts.searchPlaceholder': { ru: 'Поиск по записям...', en: 'Search entries...' },
  'receipts.preparingCsv': { ru: 'Подготовка CSV...', en: 'Preparing CSV...' },
  'receipts.csvDownloaded': { ru: 'CSV скачан', en: 'CSV downloaded' },
  'receipts.noDataToExport': { ru: 'Нет данных для экспорта', en: 'No data to export' },
  'receipts.linkedReceipts': { ru: 'Привязанные чеки', en: 'Linked Receipts' },
  'receipts.noLinkedReceipts': { ru: 'Нет привязанных чеков', en: 'No linked receipts' },
  'receipts.scanAndLink': { ru: 'Сканировать и привязать', en: 'Scan & Link' },
  'receipts.diagnostics': { ru: 'Диагностика сканера', en: 'Scanner Diagnostics' },
  'receipts.exportDiagnostics': { ru: 'Экспорт логов', en: 'Export Logs' },
  'receipts.diagnosticsExported': { ru: 'Логи экспортированы', en: 'Logs exported' },
  'receipts.noDiagnostics': { ru: 'Нет логов', en: 'No logs' },
  'receipts.scanMode': { ru: 'Режим сканирования', en: 'Scan Mode' },
  'receipts.scanAccurate': { ru: 'Точно', en: 'Accurate' },
  'receipts.scanFast': { ru: 'Быстро', en: 'Fast' },
  'receipts.scanAccurateDesc': { ru: 'Лучшее качество OCR', en: 'Best OCR quality' },
  'receipts.scanFastDesc': { ru: 'Быстрее, но менее точно', en: 'Faster, but less accurate' },
  'receipts.preprocessing': { ru: 'Улучшить для распознавания', en: 'Enhance for OCR' },
  'receipts.scannedWith': { ru: 'Распознано', en: 'Scanned with' },
  'receipts.modelPro': { ru: 'Pro (точный)', en: 'Pro (accurate)' },
  'receipts.modelFlash': { ru: 'Flash (быстрый)', en: 'Flash (fast)' },
  
  // Chat multimodal
  'chat.sendPhoto': { ru: 'Отправить фото', en: 'Send photo' },
  'chat.photoAttached': { ru: 'Фото прикреплено', en: 'Photo attached' },
  'chat.strictPrivacyBlocks': { ru: 'Строгая приватность включена — отправка изображений отключена', en: 'Strict privacy enabled — image sending disabled' },
  'chat.fromDiary': { ru: 'Из дневника', en: 'From diary' },
  'chat.fromDiaryTitle': { ru: 'Фото из дневника', en: 'Photos from diary' },
  'chat.fromDiaryHint': { ru: 'Выберите фото для отправки в чат', en: 'Select a photo to send in chat' },
  'chat.noSavedPhotos': { ru: 'Нет сохранённых фото', en: 'No saved photos' },
  'chat.noSavedPhotosHint': { ru: 'Добавьте фото к записям дневника', en: 'Add photos to your diary entries' },
  
  // AI PIN Access
  'aiPin.title': { ru: 'Доступ к ИИ', en: 'AI Access' },
  'aiPin.description': { ru: 'Введите 4-значный PIN для активации функций ИИ', en: 'Enter 4-digit PIN to enable AI features' },
  'aiPin.verifying': { ru: 'Проверка...', en: 'Verifying...' },
  'aiPin.success': { ru: 'Доступ открыт!', en: 'Access granted!' },
  'aiPin.invalidPin': { ru: 'Неверный PIN-код', en: 'Invalid PIN' },
  'aiPin.networkError': { ru: 'Ошибка сети', en: 'Network error' },
  'aiPin.notConfigured': { ru: 'Сервис не настроен', en: 'Service not configured' },
  'aiPin.error': { ru: 'Ошибка проверки', en: 'Verification error' },
  'aiPin.required': { ru: 'Требуется PIN', en: 'PIN required' },
  'aiPin.requiredHint': { ru: 'Введите PIN для доступа к функциям ИИ', en: 'Enter PIN to access AI features' },
  'aiPin.enter': { ru: 'Ввести PIN', en: 'Enter PIN' },
  'aiPin.validUntil': { ru: 'Доступ до', en: 'Access until' },
  'aiPin.revoke': { ru: 'Сбросить доступ', en: 'Revoke access' },
  'aiPin.expiresIn': { ru: 'Истекает через', en: 'Expires in' },
  'aiPin.sessionExpired': { ru: 'Сессия ИИ истекла', en: 'AI session expired' },
  'aiPin.authRequired': { ru: 'Требуется авторизация ИИ', en: 'AI authorization required' },
  'aiPin.cancelled': { ru: 'Авторизация отменена', en: 'Authorization cancelled' },
  'aiPin.invalidToken': { ru: 'Недействительный токен', en: 'Invalid token' },
  'aiPin.serviceNotConfigured': { ru: 'Сервис ИИ не настроен', en: 'AI service not configured' },
  'aiPin.retrying': { ru: 'Повторный запрос...', en: 'Retrying...' },
  'aiPin.requestId': { ru: 'ID запроса', en: 'Request ID' },
  
  // Auto-screenshot
  'autoScreenshot.title': { ru: 'Автоскриншот', en: 'Auto-screenshot' },
  'autoScreenshot.description': { ru: 'Автоматически захватывать экран при открытии чата', en: 'Automatically capture screen when opening chat' },
  'autoScreenshot.capturing': { ru: 'Захват экрана...', en: 'Capturing screen...' },
  'autoScreenshot.preview': { ru: 'Превью скриншота', en: 'Screenshot preview' },
  'autoScreenshot.send': { ru: 'Отправить', en: 'Send' },
  'autoScreenshot.dismiss': { ru: 'Отмена', en: 'Cancel' },
  'autoScreenshot.edit': { ru: 'Редактировать', en: 'Edit' },
  'autoScreenshot.failed': { ru: 'Не удалось захватить экран', en: 'Failed to capture screen' },
  'autoScreenshot.blurPrivate': { ru: 'Размывать приватные поля', en: 'Blur private fields' },
  'autoScreenshot.blurPrivateHint': { ru: 'Скрывать пароли и PIN на скриншоте', en: 'Hide passwords and PINs in screenshot' },
  
  // Navigation - Discussions
  'nav.discussions': { ru: 'Обсуждения', en: 'Discussions' },
  
  // Discussions List
  'discussions.title': { ru: 'Обсуждения', en: 'Discussions' },
  'discussions.new': { ru: 'Новое', en: 'New' },
  'discussions.empty': { ru: 'Нет обсуждений', en: 'No discussions' },
  'discussions.emptyHint': { ru: 'Выберите записи и начните обсуждение', en: 'Select entries and start discussing' },
  'discussions.delete': { ru: 'Удалить', en: 'Delete' },
  'discussions.deleteConfirm': { ru: 'Удалить обсуждение?', en: 'Delete discussion?' },
  'discussions.pin': { ru: 'Закрепить', en: 'Pin' },
  'discussions.unpin': { ru: 'Открепить', en: 'Unpin' },
  
  // Discussion Chat
  'discussion.context': { ru: 'Контекст', en: 'Context' },
  'discussion.addFromToday': { ru: 'Добавить из записей', en: 'Add from entries' },
  'discussion.sources': { ru: 'Источники', en: 'Sources' },
  'discussion.openSource': { ru: 'Открыть', en: 'Open' },
  'discussion.findInNotes': { ru: 'Найти в записях', en: 'Find in notes' },
  'discussion.offline': { ru: 'Офлайн: ИИ недоступен', en: 'Offline: AI unavailable' },
  'discussion.loadingContext': { ru: 'Загрузка контекста...', en: 'Loading context...' },
  'discussion.copyDraft': { ru: 'Скопировать', en: 'Copy' },
  'discussion.placeholder': { ru: 'Спросите о выбранных записях...', en: 'Ask about selected entries...' },
  'discussion.newSession': { ru: 'Новое обсуждение', en: 'New discussion' },
  'discussion.sending': { ru: 'Отправка...', en: 'Sending...' },
  'discussion.error': { ru: 'Ошибка', en: 'Error' },
  
  // Discussion Modes
  'mode.discuss': { ru: 'Обсудить', en: 'Discuss' },
  'mode.analyze': { ru: 'Анализ', en: 'Analyze' },
  'mode.draft': { ru: 'Черновик', en: 'Draft' },
  'mode.compute': { ru: 'Расчёт', en: 'Compute' },
  'mode.plan': { ru: 'План', en: 'Plan' },
  
  // Today - Selection
  'today.select': { ru: 'Выбрать', en: 'Select' },
  'today.cancel': { ru: 'Отмена', en: 'Cancel' },
  'today.discuss': { ru: 'Обсудить', en: 'Discuss' },
  
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
      if (saved === 'ru' || saved === 'en') return saved;
      // Auto-detect from browser
      const browserLang = navigator.language.slice(0, 2);
      return browserLang === 'ru' ? 'ru' : 'en';
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
    return translation[language];
  };

  useEffect(() => {
    document.documentElement.lang = language;
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
