/**
 * Quick Reminder Sheet - create reminders directly from Today page.
 * Auto-creates a minimal diary entry to maintain entryId link.
 */

import { useState } from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Bell, CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { TIME_CHIPS } from '@/lib/reminderUtils';
import { createEntry, createReminder } from '@/lib/db';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SuggestedTime } from '@/lib/reminderDetection';

interface QuickReminderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickReminderSheet({ open, onOpenChange }: QuickReminderSheetProps) {
  const { language } = useI18n();
  
  const [actionText, setActionText] = useState('');
  const [selectedChip, setSelectedChip] = useState<SuggestedTime | null>('tomorrow_morning');
  const [isCreating, setIsCreating] = useState(false);
  
  // Custom date/time picker state
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [customTime, setCustomTime] = useState('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
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
      toast.error(language === 'ru' ? 'Введите текст напоминания' : 'Enter reminder text');
      return;
    }
    
    const dueAt = computeDueAt();
    if (dueAt === null) {
      toast.error(language === 'ru' ? 'Выберите время в будущем' : 'Select a future time');
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
      });
      
      // Step 3: Reconcile notifications
      await reconcileReminderNotifications(language);
      
      toast.success(language === 'ru' ? 'Напоминание создано' : 'Reminder created');
      
      // Reset and close
      resetAndClose();
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error(language === 'ru' ? 'Ошибка создания' : 'Creation failed');
    } finally {
      setIsCreating(false);
    }
  };
  
  const resetAndClose = () => {
    setActionText('');
    setSelectedChip('tomorrow_morning');
    setCustomDate(undefined);
    setCustomTime('09:00');
    onOpenChange(false);
  };
  
  // Handle chip selection (clears custom)
  const handleChipSelect = (chipId: SuggestedTime) => {
    setSelectedChip(chipId);
    setCustomDate(undefined);
  };
  
  // Handle custom date selection (clears chip)
  const handleCustomDateSelect = (date: Date | undefined) => {
    setCustomDate(date);
    if (date) {
      setSelectedChip(null);
    }
  };
  
  // Format custom selection for display
  const formatCustomSelection = (): string | null => {
    if (!customDate) return null;
    const dateStr = format(customDate, language === 'ru' ? 'd MMM' : 'MMM d', { 
      locale: language === 'ru' ? ru : enUS 
    });
    const timeStr = customTime;
    return language === 'ru' 
      ? `Выбрано: ${dateStr}, ${timeStr}`
      : `Selected: ${dateStr}, ${timeStr}`;
  };
  
  const customSelectionLabel = formatCustomSelection();
  const hasSelection = selectedChip !== null || customDate !== undefined;
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-cyber-sigil" />
            {language === 'ru' ? 'Новое напоминание' : 'New reminder'}
          </SheetTitle>
          <SheetDescription>
            {language === 'ru' 
              ? 'Создайте напоминание о важном деле'
              : 'Create a reminder for something important'}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Action text input */}
          <div className="space-y-2">
            <Label htmlFor="action-text">
              {language === 'ru' ? 'Что напомнить?' : 'What to remind?'}
            </Label>
            <Input
              id="action-text"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder={language === 'ru' ? 'Напр: Позвонить маме' : 'E.g: Call mom'}
              autoFocus
              disabled={isCreating}
            />
          </div>
          
          {/* Time chips */}
          <div className="space-y-2">
            <Label>
              {language === 'ru' ? 'Когда?' : 'When?'}
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
                  {language === 'ru' ? chip.labelRu : chip.labelEn}
                </button>
              ))}
            </div>
            
            {/* Custom time picker */}
            <div className="flex items-center gap-2 pt-2">
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCreating}
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      customDate && "border-primary"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {customDate 
                      ? format(customDate, 'dd.MM.yyyy')
                      : (language === 'ru' ? 'Выбрать время…' : 'Pick time…')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  disabled={isCreating}
                  className="w-24"
                />
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
          
          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={resetAndClose}
              disabled={isCreating}
              className="flex-1"
            >
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !actionText.trim() || !hasSelection}
              className="flex-1"
            >
              {isCreating 
                ? (language === 'ru' ? 'Создание...' : 'Creating...') 
                : (language === 'ru' ? 'Создать' : 'Create')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
