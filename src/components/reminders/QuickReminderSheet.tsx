/**
 * Quick Reminder Sheet - create reminders directly from Today page.
 * Auto-creates a minimal diary entry to maintain entryId link.
 * Supports ru, en, he, ar languages with RTL layout.
 */

import { useState } from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Bell, CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackUsageEvent } from '@/lib/usageTracker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { TIME_CHIPS, REPEAT_OPTIONS, getLabel } from '@/lib/reminderUtils';
import { createEntry, createReminder, type ReminderRepeat } from '@/lib/db';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SuggestedTime } from '@/lib/reminderDetection';

// ============================================
// LOCALIZED TEXTS
// ============================================

const texts = {
  title: { ru: 'Новое напоминание', en: 'New reminder', he: 'תזכורת חדשה', ar: 'تذكير جديد' },
  description: { 
    ru: 'Создайте напоминание о важном деле', 
    en: 'Create a reminder for something important', 
    he: 'צור תזכורת לדבר חשוב', 
    ar: 'أنشئ تذكيراً لشيء مهم' 
  },
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

type TextKey = keyof typeof texts;

interface QuickReminderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickReminderSheet({ open, onOpenChange }: QuickReminderSheetProps) {
  const { language } = useI18n();
  
  // Helper to get localized text
  const t = (key: TextKey): string => 
    texts[key][language as keyof typeof texts[TextKey]] || texts[key].en;
  
  const [actionText, setActionText] = useState('');
  const [selectedChip, setSelectedChip] = useState<SuggestedTime | null>('tomorrow_morning');
  const [isCreating, setIsCreating] = useState(false);
  const [repeat, setRepeat] = useState<ReminderRepeat>('none');
  
  // Custom date/time picker state
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [customTime, setCustomTime] = useState('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Get base language for date-fns (he/ar fallback to en)
  const getBaseLanguage = () => (language === 'ru' ? 'ru' : 'en');
  const getDateLocale = () => (language === 'ru' ? ru : enUS);
  
  // Compute final dueAt from either chip or custom selection
  const computeDueAt = (): number | null => {
    if (customDate) {
      const [hours, minutes] = customTime.split(':').map(Number);
      const timestamp = setMinutes(setHours(customDate, hours), minutes).getTime();
      
      // Validate not in the past
      if (timestamp <= Date.now()) {
        return null; // Will trigger validation error
      }
      return timestamp;
    }
    
    if (selectedChip) {
      const chip = TIME_CHIPS.find(c => c.id === selectedChip);
      return chip?.getTimestamp() ?? Date.now() + 24 * 60 * 60 * 1000;
    }
    
    return null;
  };
  
  const handleCreate = async () => {
    if (!actionText.trim()) {
      toast.error(t('enterText'));
      return;
    }
    
    const dueAt = computeDueAt();
    if (dueAt === null) {
      toast.error(t('selectFuture'));
      return;
    }
    
    setIsCreating(true);
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Step 1: Create minimal diary entry to serve as source
      const entryId = await createEntry({
        date: today,
        text: actionText.trim(),
        mood: null,
        tags: [],
        isPrivate: false,
      });
      
      // Step 2: Create reminder linked to that entry
      await createReminder({
        entryId,
        sourceText: actionText.trim(),
        actionText: actionText.trim(),
        dueAt,
        status: 'pending',
        repeat,
      });
      
      // Step 3: Reconcile notifications
      await reconcileReminderNotifications(language);
      
      // Track usage
      trackUsageEvent('remindersCreated');
      
      toast.success(t('created'));
      
      // Reset and close
      resetAndClose();
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error(t('failed'));
    } finally {
      setIsCreating(false);
    }
  };
  
  const resetAndClose = () => {
    setActionText('');
    setSelectedChip('tomorrow_morning');
    setCustomDate(undefined);
    setCustomTime('09:00');
    setRepeat('none');
    onOpenChange(false);
  };
  
  // Handle chip selection (clears custom)
  const handleChipSelect = (chipId: SuggestedTime) => {
    setSelectedChip(chipId);
    setCustomDate(undefined);
  };
  
  // Handle custom date selection (clears chip, closes popover)
  const handleCustomDateSelect = (date: Date | undefined) => {
    setCustomDate(date);
    if (date) {
      setSelectedChip(null);
      setShowDatePicker(false); // Close calendar after selection
    }
  };
  
  // Clear custom date selection
  const handleClearCustomDate = () => {
    setCustomDate(undefined);
    setCustomTime('09:00');
  };
  
  // Format chip time preview
  const getChipTimePreview = (): string | null => {
    if (!selectedChip) return null;
    const chip = TIME_CHIPS.find(c => c.id === selectedChip);
    if (!chip) return null;
    const timestamp = chip.getTimestamp();
    const date = new Date(timestamp);
    const baseLang = getBaseLanguage();
    const dateStr = format(date, baseLang === 'ru' ? 'd MMM, HH:mm' : 'MMM d, HH:mm', { 
      locale: getDateLocale() 
    });
    return dateStr;
  };
  
  const chipTimePreview = getChipTimePreview();
  
  // Format custom selection for display
  const formatCustomSelection = (): string | null => {
    if (!customDate) return null;
    const baseLang = getBaseLanguage();
    const dateStr = format(customDate, baseLang === 'ru' ? 'd MMM' : 'MMM d', { 
      locale: getDateLocale() 
    });
    const timeStr = customTime;
    const selectedLabel = t('selected');
    return `${selectedLabel}: ${dateStr}, ${timeStr}`;
  };
  
  const customSelectionLabel = formatCustomSelection();
  const hasSelection = selectedChip !== null || customDate !== undefined;
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 rtl:flex-row-reverse">
            <Bell className="h-5 w-5 text-cyber-sigil" />
            {t('title')}
          </SheetTitle>
          <SheetDescription>
            {t('description')}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Action text input */}
          <div className="space-y-2">
            <Label htmlFor="action-text">
              {t('whatToRemind')}
            </Label>
            <Input
              id="action-text"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder={t('placeholder')}
              autoFocus
              disabled={isCreating}
            />
          </div>
          
          {/* Time chips */}
          <div className="space-y-2">
            <Label>
              {t('when')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {TIME_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleChipSelect(chip.id)}
                  disabled={isCreating}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    selectedChip === chip.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {getLabel(chip, language)}
                </button>
              ))}
            </div>
            
            {/* Chip time preview */}
            {chipTimePreview && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span dir="ltr">{chipTimePreview}</span>
              </p>
            )}
            
            {/* Custom time picker */}
            <div className="flex items-center gap-2 pt-2">
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCreating}
                    className={cn(
                      "flex-1 justify-start text-start font-normal",
                      customDate && "border-primary"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 me-2" />
                    {customDate 
                      ? <span dir="ltr">{format(customDate, 'dd.MM.yyyy')}</span>
                      : t('pickDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={handleCustomDateSelect}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              {customDate && (
                <>
                  <Input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    disabled={isCreating}
                    className="w-24"
                    dir="ltr"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearCustomDate}
                    disabled={isCreating}
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                    aria-label={t('clearDate')}
                  >
                    ×
                  </Button>
                </>
              )}
            </div>
            
            {/* Custom selection label */}
            {customSelectionLabel && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {customSelectionLabel}
              </p>
            )}
          </div>
          
          {/* Repeat selector */}
          <div className="space-y-2">
            <Label>
              {t('repeat')}
            </Label>
            <div className="flex flex-wrap gap-2">
              {REPEAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRepeat(option.value)}
                  disabled={isCreating}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    repeat === option.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {getLabel(option, language)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={resetAndClose}
              disabled={isCreating}
              className="flex-1"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !actionText.trim() || !hasSelection}
              className="flex-1"
            >
              {isCreating ? t('creating') : t('create')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
