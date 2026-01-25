/**
 * Quick Reminder Sheet - create reminders directly from Today page.
 * Auto-creates a minimal diary entry to maintain entryId link.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [selectedTime, setSelectedTime] = useState<SuggestedTime>('tomorrow_morning');
  const [isCreating, setIsCreating] = useState(false);
  
  const handleCreate = async () => {
    if (!actionText.trim()) {
      toast.error(language === 'ru' ? 'Введите текст напоминания' : 'Enter reminder text');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const chip = TIME_CHIPS.find(c => c.id === selectedTime);
      const dueAt = chip?.getTimestamp() ?? Date.now() + 24 * 60 * 60 * 1000;
      
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
      setActionText('');
      setSelectedTime('tomorrow_morning');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error(language === 'ru' ? 'Ошибка создания' : 'Creation failed');
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleClose = () => {
    setActionText('');
    setSelectedTime('tomorrow_morning');
    onOpenChange(false);
  };
  
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
                  onClick={() => setSelectedTime(chip.id)}
                  disabled={isCreating}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    selectedTime === chip.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {language === 'ru' ? chip.labelRu : chip.labelEn}
                </button>
              ))}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
              className="flex-1"
            >
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !actionText.trim()}
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
