import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check, Clock, X, Trash2, ChevronDown, CalendarIcon, Save, FileText, ExternalLink, Repeat, SkipForward } from 'lucide-react';
import { format, setHours, setMinutes } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import {
  type Reminder,
  type DiaryEntry,
  type ReminderRepeat,
  getReminderById,
  getEntryById,
  updateReminderText,
  rescheduleReminder,
  completeReminder,
  dismissReminder,
  snoozeReminder,
  deleteReminder,
  updateReminderRepeat,
  updateReminderSkipNext,
} from '@/lib/db';
import {
  formatDueDate,
  isOverdue,
  SNOOZE_PRESETS,
  getSnoozeTimestamp,
  REPEAT_OPTIONS,
  computeNextDueAt,
  getLabel,
} from '@/lib/reminderUtils';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';

// ============================================
// LOCALIZED TEXTS
// ============================================

const texts = {
  // Not found
  notFound: { ru: 'Напоминание не найдено', en: 'Reminder not found', he: 'התזכורת לא נמצאה', ar: 'التذكير غير موجود' },
  notFoundHint: { ru: 'Возможно, оно было удалено или выполнено.', en: 'It may have been deleted or completed.', he: 'אולי נמחקה או הושלמה.', ar: 'ربما تم حذفه أو إكماله.' },
  back: { ru: 'Назад', en: 'Back to Today', he: 'חזרה', ar: 'رجوع' },
  
  // Header
  reminder: { ru: 'Напоминание', en: 'Reminder', he: 'תזכורת', ar: 'تذكير' },
  
  // Delete dialog
  deleteConfirm: { ru: 'Удалить напоминание?', en: 'Delete reminder?', he: 'למחוק תזכורת?', ar: 'حذف التذكير؟' },
  deleteHint: { ru: 'Это действие нельзя отменить.', en: 'This action cannot be undone.', he: 'לא ניתן לבטל פעולה זו.', ar: 'لا يمكن التراجع عن هذا الإجراء.' },
  cancel: { ru: 'Отмена', en: 'Cancel', he: 'ביטול', ar: 'إلغاء' },
  delete: { ru: 'Удалить', en: 'Delete', he: 'מחק', ar: 'حذف' },
  
  // Action text
  whatToDo: { ru: 'Что нужно сделать', en: 'What to do', he: 'מה לעשות', ar: 'ما يجب فعله' },
  actionPlaceholder: { ru: 'Действие...', en: 'Action...', he: 'פעולה...', ar: 'إجراء...' },
  save: { ru: 'Сохранить', en: 'Save', he: 'שמור', ar: 'حفظ' },
  saved: { ru: 'Сохранено', en: 'Saved', he: 'נשמר', ar: 'تم الحفظ' },
  saveFailed: { ru: 'Ошибка сохранения', en: 'Save failed', he: 'השמירה נכשלה', ar: 'فشل الحفظ' },
  
  // When
  when: { ru: 'Когда', en: 'When', he: 'מתי', ar: 'متى' },
  reschedule: { ru: 'Изменить время', en: 'Reschedule', he: 'שנה זמן', ar: 'إعادة جدولة' },
  rescheduled: { ru: 'Время изменено', en: 'Rescheduled', he: 'הזמן שונה', ar: 'تمت إعادة الجدولة' },
  
  // Repeat
  repeat: { ru: 'Повторять', en: 'Repeat', he: 'חזרה', ar: 'تكرار' },
  skipNext: { ru: 'Пропустить следующее', en: 'Skip next', he: 'דלג על הבא', ar: 'تخطي التالي' },
  skipNextConfirm: { ru: 'Пропустить следующее?', en: 'Skip next?', he: 'לדלג על הבא?', ar: 'تخطي التالي؟' },
  skipNextHint: { ru: 'Следующее повторение не будет создано при выполнении.', en: 'The next occurrence will not be created when you complete this reminder.', he: 'ההתרחשות הבאה לא תיווצר כשתסיים את התזכורת.', ar: 'لن يتم إنشاء التكرار التالي عند إكمال هذا التذكير.' },
  confirm: { ru: 'Подтвердить', en: 'Confirm', he: 'אישור', ar: 'تأكيد' },
  nextSkipped: { ru: 'Следующее: пропущено', en: 'Next: skipped', he: 'הבא: דילוג', ar: 'التالي: تم التخطي' },
  next: { ru: 'Следующее: ', en: 'Next: ', he: 'הבא: ', ar: 'التالي: ' },
  
  // Source
  sourceText: { ru: 'Исходный текст', en: 'Source text', he: 'טקסט מקור', ar: 'النص المصدر' },
  noText: { ru: 'Нет текста', en: 'No text', he: 'אין טקסט', ar: 'لا يوجد نص' },
  source: { ru: 'Источник', en: 'Source', he: 'מקור', ar: 'المصدر' },
  sourceNotFound: { ru: 'Источник не найден', en: 'Source not found', he: 'המקור לא נמצא', ar: 'المصدر غير موجود' },
  openEntry: { ru: 'Открыть запись', en: 'Open entry', he: 'פתח רשומה', ar: 'فتح المدخل' },
  
  // Actions
  done: { ru: 'Готово', en: 'Done', he: 'בוצע', ar: 'تم' },
  doneSuccess: { ru: 'Выполнено!', en: 'Done!', he: 'בוצע!', ar: 'تم!' },
  snooze: { ru: 'Отложить', en: 'Snooze', he: 'נודניק', ar: 'تأجيل' },
  snoozed: { ru: 'Отложено', en: 'Snoozed', he: 'נדחה', ar: 'تم التأجيل' },
  dismiss: { ru: 'Отклонить', en: 'Dismiss', he: 'התעלם', ar: 'رفض' },
  dismissed: { ru: 'Отклонено', en: 'Dismissed', he: 'נדחה', ar: 'تم الرفض' },
  deleted: { ru: 'Удалено', en: 'Deleted', he: 'נמחק', ar: 'تم الحذف' },
  error: { ru: 'Ошибка', en: 'Failed', he: 'נכשל', ar: 'فشل' },
};

type TextKey = keyof typeof texts;

export default function ReminderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useI18n();
  
  // Helper to get localized text
  const t = (key: TextKey): string => 
    texts[key][language as keyof typeof texts[TextKey]] || texts[key].en;
  
  // Get base language for date-fns (he/ar fallback to en)
  const getDateLocale = () => (language === 'ru' ? ru : enUS);
  
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [sourceEntry, setSourceEntry] = useState<DiaryEntry | null | undefined>(undefined); // undefined = loading, null = not found
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  // Edit states
  const [actionText, setActionText] = useState('');
  const [hasTextChanges, setHasTextChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Date/time editing
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Source text collapsible
  const [sourceOpen, setSourceOpen] = useState(false);
  
  // Skip next confirmation dialog
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  
  // Load reminder
  useEffect(() => {
    async function load() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      
      const reminderId = parseInt(id, 10);
      if (isNaN(reminderId)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      
      const found = await getReminderById(reminderId);
      if (!found) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      
      setReminder(found);
      setActionText(found.actionText);
      
      const dueDate = new Date(found.dueAt);
      setSelectedDate(dueDate);
      setSelectedTime(format(dueDate, 'HH:mm'));
      
      // Load source entry if entryId exists
      if (found.entryId) {
        const entry = await getEntryById(found.entryId);
        setSourceEntry(entry ?? null);
      } else {
        setSourceEntry(null);
      }
      
      setLoading(false);
    }
    
    load();
  }, [id]);
  
  // Handle action text changes
  const handleTextChange = (value: string) => {
    setActionText(value);
    setHasTextChanges(value !== reminder?.actionText);
  };
  
  // Save text changes
  const handleSaveText = async () => {
    if (!reminder?.id || !hasTextChanges) return;
    
    setIsSaving(true);
    try {
      await updateReminderText(reminder.id, actionText);
      setReminder(prev => prev ? { ...prev, actionText } : null);
      setHasTextChanges(false);
      toast.success(t('saved'));
    } catch (error) {
      toast.error(t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };
  
  // Reschedule
  const handleReschedule = async () => {
    if (!reminder?.id || !selectedDate) return;
    
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newDueAt = setMinutes(setHours(selectedDate, hours), minutes).getTime();
    
    setIsSaving(true);
    try {
      await rescheduleReminder(reminder.id, newDueAt);
      await reconcileReminderNotifications(language);
      setReminder(prev => prev ? { ...prev, dueAt: newDueAt, snoozedUntil: undefined } : null);
      setShowDatePicker(false);
      toast.success(t('rescheduled'));
    } catch (error) {
      toast.error(t('error'));
    } finally {
      setIsSaving(false);
    }
  };
  
  // Actions
  const handleDone = async () => {
    if (!reminder?.id) return;
    await completeReminder(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(t('doneSuccess'));
    navigate('/');
  };
  
  const handleRepeatChange = async (newRepeat: ReminderRepeat) => {
    if (!reminder?.id) return;
    setIsSaving(true);
    try {
      await updateReminderRepeat(reminder.id, newRepeat);
      setReminder(prev => prev ? { ...prev, repeat: newRepeat } : null);
      toast.success(t('saved'));
    } catch (error) {
      toast.error(t('error'));
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSkipNextChange = async (skipNext: boolean) => {
    if (!reminder?.id) return;
    setIsSaving(true);
    try {
      await updateReminderSkipNext(reminder.id, skipNext);
      setReminder(prev => prev ? { ...prev, skipNext } : null);
    } catch (error) {
      toast.error(t('error'));
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDismiss = async () => {
    if (!reminder?.id) return;
    await dismissReminder(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(t('dismissed'));
    navigate('/');
  };
  
  const handleSnooze = async (presetId: string) => {
    if (!reminder?.id) return;
    const snoozedUntil = getSnoozeTimestamp(presetId);
    await snoozeReminder(reminder.id, snoozedUntil);
    await reconcileReminderNotifications(language);
    toast.success(t('snoozed'));
    navigate('/');
  };
  
  const handleDelete = async () => {
    if (!reminder?.id) return;
    await deleteReminder(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(t('deleted'));
    navigate('/');
  };
  
  // Not found state
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Bell className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2">
          {t('notFound')}
        </h2>
        <p className="text-muted-foreground text-center mb-6">
          {t('notFoundHint')}
        </p>
        <Button onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {t('back')}
        </Button>
      </div>
    );
  }
  
  // Loading state
  if (loading || !reminder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  const overdueStatus = isOverdue(reminder.dueAt);
  const dueLabel = formatDueDate(reminder.dueAt, language);
  
  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 panel-glass border-b border-border/50 backdrop-blur-md">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-semibold">
            {t('reminder')}
          </h1>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('deleteConfirm')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('deleteHint')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t('cancel')}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  {t('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
      
      <main className="p-4 space-y-4">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <div 
            className={cn(
              'h-3 w-3 rounded-full',
              overdueStatus ? 'bg-destructive animate-pulse' : 'bg-amber-500'
            )} 
          />
          <span 
            className={cn(
              'text-sm font-medium',
              overdueStatus ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
            )}
          >
            {dueLabel}
          </span>
        </div>
        
        {/* Action text edit */}
        <Card className="panel-glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t('whatToDo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={actionText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={t('actionPlaceholder')}
              className="text-base"
            />
            {hasTextChanges && (
              <Button 
                size="sm" 
                onClick={handleSaveText}
                disabled={isSaving}
                className="w-full"
              >
                <Save className="h-4 w-4 me-2" />
                {t('save')}
              </Button>
            )}
          </CardContent>
        </Card>
        
        {/* Due date/time edit */}
        <Card className="panel-glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {t('when')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {/* Date picker */}
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-start font-normal"
                  >
                    <CalendarIcon className="h-4 w-4 me-2" />
                    {selectedDate ? <span dir="ltr">{format(selectedDate, 'dd.MM.yyyy')}</span> : '—'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              {/* Time input */}
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-28"
                dir="ltr"
              />
            </div>
            
            <Button 
              onClick={handleReschedule}
              disabled={isSaving || !selectedDate}
              className="w-full"
            >
              <Clock className="h-4 w-4 me-2" />
              {t('reschedule')}
            </Button>
          </CardContent>
        </Card>
        
        {/* Repeat setting */}
        <Card className="panel-glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              {t('repeat')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              {REPEAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleRepeatChange(option.value)}
                  disabled={isSaving}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    reminder.repeat === option.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {getLabel(option, language)}
                </button>
              ))}
            </div>
            
            {/* Skip next toggle (only for repeating) */}
            {reminder.repeat && reminder.repeat !== 'none' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (reminder.skipNext) {
                      // Disable without confirmation
                      handleSkipNextChange(false);
                    } else {
                      // Show confirmation dialog
                      setShowSkipConfirm(true);
                    }
                  }}
                  disabled={isSaving}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors w-full",
                    reminder.skipNext
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400"
                      : "bg-background border-border hover:bg-accent"
                  )}
                >
                  <SkipForward className="h-4 w-4" />
                  {t('skipNext')}
                </button>
                
                {/* Skip next confirmation dialog */}
                <AlertDialog open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('skipNextConfirm')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('skipNextHint')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => {
                          handleSkipNextChange(true);
                          setShowSkipConfirm(false);
                        }}
                      >
                        {t('confirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            
            {/* Next occurrence preview */}
            {reminder.repeat && reminder.repeat !== 'none' && (() => {
              // If skipNext is true, show "skipped" message
              if (reminder.skipNext) {
                return (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {t('nextSkipped')}
                  </p>
                );
              }
              
              const nextDue = computeNextDueAt(reminder.dueAt, reminder.repeat);
              if (!nextDue) return null;
              const nextDate = new Date(nextDue);
              const nextLabel = format(nextDate, 'd MMM, HH:mm', { locale: getDateLocale() });
              return (
                <p className="text-sm text-muted-foreground">
                  {t('next')}
                  <span className="text-foreground" dir="ltr">{nextLabel}</span>
                </p>
              );
            })()}
          </CardContent>
        </Card>
        
        {/* Source text (collapsible) */}
        <Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
          <Card className="panel-glass">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{t('sourceText')}</span>
                  <ChevronDown 
                    className={cn(
                      'h-4 w-4 transition-transform',
                      sourceOpen && 'rotate-180'
                    )} 
                  />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {reminder.sourceText || t('noText')}
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        
        {/* Source diary entry */}
        <Card className="panel-glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t('source')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {sourceEntry === undefined ? (
              <div className="h-12 animate-pulse rounded bg-muted" />
            ) : sourceEntry === null ? (
              <p className="text-sm text-muted-foreground italic">
                {t('sourceNotFound')}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {format(new Date(sourceEntry.date), 'd MMMM yyyy', { locale: getDateLocale() })}
                </p>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {sourceEntry.text.length > 150 
                    ? sourceEntry.text.slice(0, 150).trim() + '…' 
                    : sourceEntry.text}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/entry/${sourceEntry.id}`)}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 me-2" />
                  {t('openEntry')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2 pt-4">
          {/* Done */}
          <Button
            onClick={handleDone}
            className="flex-col h-auto py-3 bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="h-5 w-5 mb-1" />
            <span className="text-xs">{t('done')}</span>
          </Button>
          
          {/* Snooze dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="flex-col h-auto py-3 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <Clock className="h-5 w-5 mb-1" />
                <span className="text-xs">{t('snooze')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[160px]">
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => handleSnooze(preset.id)}
                >
                  {getLabel(preset, language)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Dismiss */}
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="flex-col h-auto py-3 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <X className="h-5 w-5 mb-1" />
            <span className="text-xs">{t('dismiss')}</span>
          </Button>
        </div>
      </main>
    </div>
  );
}
