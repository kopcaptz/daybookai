/**
 * ReminderPrompt - Bottom sheet shown after saving an actionable diary entry.
 * Allows quick reminder creation linked to the saved entry.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { TIME_CHIPS, getTimestampForPreset } from '@/lib/reminderUtils';
import { extractActionSnippet, type SuggestedTime } from '@/lib/reminderDetection';
import { createReminder } from '@/lib/db';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReminderPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number;
  sourceText: string;
  suggestedTime: SuggestedTime;
}

export function ReminderPrompt({
  open,
  onOpenChange,
  entryId,
  sourceText,
  suggestedTime,
}: ReminderPromptProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  
  const [selectedPreset, setSelectedPreset] = useState<SuggestedTime>(suggestedTime);
  const [isCreating, setIsCreating] = useState(false);
  
  // Extract a short snippet for display
  const snippet = extractActionSnippet(sourceText, 80);
  
  const handleCreate = async () => {
    if (!entryId) {
      toast.error(language === 'ru' ? 'Ошибка: запись не найдена' : 'Error: entry not found');
      return;
    }
    
    const dueAt = getTimestampForPreset(selectedPreset);
    if (!dueAt || dueAt <= Date.now()) {
      toast.error(language === 'ru' ? 'Ошибка времени' : 'Invalid time');
      return;
    }
    
    setIsCreating(true);
    
    try {
      const actionText = extractActionSnippet(sourceText, 100);
      
      await createReminder({
        entryId,
        sourceText: sourceText.slice(0, 500), // Store more context
        actionText,
        dueAt,
        status: 'pending',
        repeat: 'none',
      });
      
      // Reconcile notifications
      await reconcileReminderNotifications(language);
      
      toast.success(language === 'ru' ? 'Напоминание создано' : 'Reminder created');
      
      onOpenChange(false);
      navigate('/today');
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error(language === 'ru' ? 'Ошибка создания' : 'Creation failed');
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleDismiss = () => {
    onOpenChange(false);
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-cyber-sigil" />
            {language === 'ru' ? 'Добавить напоминание?' : 'Add a reminder?'}
          </SheetTitle>
          <SheetDescription>
            {language === 'ru' 
              ? 'Похоже, это важное дело. Напомнить позже?'
              : 'This looks like an action item. Set a reminder?'}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Source text snippet */}
          <div className="panel-glass p-3 rounded-lg">
            <p className="text-sm text-foreground/90 line-clamp-2">
              "{snippet}"
            </p>
          </div>
          
          {/* Time preset chips */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Когда напомнить?' : 'When to remind?'}
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedPreset(chip.id)}
                  disabled={isCreating}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    selectedPreset === chip.id
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
              onClick={handleDismiss}
              disabled={isCreating}
              className="flex-1"
            >
              {language === 'ru' ? 'Не сейчас' : 'Not now'}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !entryId}
              className="flex-1 btn-cyber"
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
