import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check, Clock, X, Trash2, ChevronDown, CalendarIcon, Save, FileText, ExternalLink } from 'lucide-react';
import { format, setHours, setMinutes } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  getReminderById,
  getEntryById,
  updateReminderText,
  rescheduleReminder,
  markReminderDone,
  dismissReminder,
  snoozeReminder,
  deleteReminder,
} from '@/lib/db';
import {
  formatDueDate,
  isOverdue,
  SNOOZE_PRESETS,
  getSnoozeTimestamp,
} from '@/lib/reminderUtils';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';

export default function ReminderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language, t } = useI18n();
  
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
      toast.success(language === 'ru' ? 'Сохранено' : 'Saved');
    } catch (error) {
      toast.error(language === 'ru' ? 'Ошибка сохранения' : 'Save failed');
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
      toast.success(language === 'ru' ? 'Время изменено' : 'Rescheduled');
    } catch (error) {
      toast.error(language === 'ru' ? 'Ошибка' : 'Failed');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Actions
  const handleDone = async () => {
    if (!reminder?.id) return;
    await markReminderDone(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(language === 'ru' ? 'Выполнено!' : 'Done!');
    navigate('/');
  };
  
  const handleDismiss = async () => {
    if (!reminder?.id) return;
    await dismissReminder(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(language === 'ru' ? 'Отклонено' : 'Dismissed');
    navigate('/');
  };
  
  const handleSnooze = async (presetId: string) => {
    if (!reminder?.id) return;
    const snoozedUntil = getSnoozeTimestamp(presetId);
    await snoozeReminder(reminder.id, snoozedUntil);
    await reconcileReminderNotifications(language);
    toast.success(language === 'ru' ? 'Отложено' : 'Snoozed');
    navigate('/');
  };
  
  const handleDelete = async () => {
    if (!reminder?.id) return;
    await deleteReminder(reminder.id);
    await reconcileReminderNotifications(language);
    toast.success(language === 'ru' ? 'Удалено' : 'Deleted');
    navigate('/');
  };
  
  // Not found state
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Bell className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2">
          {language === 'ru' ? 'Напоминание не найдено' : 'Reminder not found'}
        </h2>
        <p className="text-muted-foreground text-center mb-6">
          {language === 'ru' 
            ? 'Возможно, оно было удалено или выполнено.'
            : 'It may have been deleted or completed.'}
        </p>
        <Button onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {language === 'ru' ? 'Назад' : 'Back to Today'}
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
            {language === 'ru' ? 'Напоминание' : 'Reminder'}
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
                  {language === 'ru' ? 'Удалить напоминание?' : 'Delete reminder?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {language === 'ru' 
                    ? 'Это действие нельзя отменить.'
                    : 'This action cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {language === 'ru' ? 'Отмена' : 'Cancel'}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  {language === 'ru' ? 'Удалить' : 'Delete'}
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
              {language === 'ru' ? 'Что нужно сделать' : 'What to do'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={actionText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={language === 'ru' ? 'Действие...' : 'Action...'}
              className="text-base"
            />
            {hasTextChanges && (
              <Button 
                size="sm" 
                onClick={handleSaveText}
                disabled={isSaving}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {language === 'ru' ? 'Сохранить' : 'Save'}
              </Button>
            )}
          </CardContent>
        </Card>
        
        {/* Due date/time edit */}
        <Card className="panel-glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {language === 'ru' ? 'Когда' : 'When'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {/* Date picker */}
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {selectedDate ? format(selectedDate, 'dd.MM.yyyy') : '—'}
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
              />
            </div>
            
            <Button 
              onClick={handleReschedule}
              disabled={isSaving || !selectedDate}
              className="w-full"
            >
              <Clock className="h-4 w-4 mr-2" />
              {language === 'ru' ? 'Изменить время' : 'Reschedule'}
            </Button>
          </CardContent>
        </Card>
        
        {/* Source text (collapsible) */}
        <Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
          <Card className="panel-glass">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{language === 'ru' ? 'Исходный текст' : 'Source text'}</span>
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
                  {reminder.sourceText || (language === 'ru' ? 'Нет текста' : 'No text')}
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
              {language === 'ru' ? 'Источник' : 'Source'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {sourceEntry === undefined ? (
              <div className="h-12 animate-pulse rounded bg-muted" />
            ) : sourceEntry === null ? (
              <p className="text-sm text-muted-foreground italic">
                {language === 'ru' ? 'Источник не найден' : 'Source not found'}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {format(new Date(sourceEntry.date), 'd MMMM yyyy', { locale: language === 'ru' ? ru : enUS })}
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
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {language === 'ru' ? 'Открыть запись' : 'Open entry'}
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
            <span className="text-xs">{language === 'ru' ? 'Готово' : 'Done'}</span>
          </Button>
          
          {/* Snooze dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="flex-col h-auto py-3 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <Clock className="h-5 w-5 mb-1" />
                <span className="text-xs">{language === 'ru' ? 'Отложить' : 'Snooze'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[160px]">
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => handleSnooze(preset.id)}
                >
                  {language === 'ru' ? preset.labelRu : preset.labelEn}
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
            <span className="text-xs">{language === 'ru' ? 'Отклонить' : 'Dismiss'}</span>
          </Button>
        </div>
      </main>
    </div>
  );
}
