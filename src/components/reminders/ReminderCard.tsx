import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { 
  type Reminder, 
  markReminderDone, 
  dismissReminder, 
  snoozeReminder 
} from '@/lib/db';
import { 
  formatDueDate, 
  isOverdue, 
  SNOOZE_PRESETS, 
  getSnoozeTimestamp 
} from '@/lib/reminderUtils';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';

interface ReminderCardProps {
  reminder: Reminder;
  variant: 'overdue' | 'today' | 'upcoming';
  onAction?: () => void;
}

export function ReminderCard({ reminder, variant, onAction }: ReminderCardProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const [isActioning, setIsActioning] = useState(false);
  
  const handleDone = async () => {
    setIsActioning(true);
    try {
      await markReminderDone(reminder.id!);
      await reconcileReminderNotifications(language);
      onAction?.();
    } finally {
      setIsActioning(false);
    }
  };
  
  const handleDismiss = async () => {
    setIsActioning(true);
    try {
      await dismissReminder(reminder.id!);
      await reconcileReminderNotifications(language);
      onAction?.();
    } finally {
      setIsActioning(false);
    }
  };
  
  const handleSnooze = async (presetId: string) => {
    setIsActioning(true);
    try {
      const snoozedUntil = getSnoozeTimestamp(presetId);
      await snoozeReminder(reminder.id!, snoozedUntil);
      await reconcileReminderNotifications(language);
      onAction?.();
    } finally {
      setIsActioning(false);
    }
  };
  
  const dueLabel = formatDueDate(reminder.dueAt, language);
  const isOverdueVariant = variant === 'overdue';
  const isTodayVariant = variant === 'today';
  const isUpcomingVariant = variant === 'upcoming';
  
  const handleCardClick = () => {
    if (reminder.id) {
      navigate(`/reminder/${reminder.id}`);
    }
  };
  
  return (
    <div 
      className={cn(
        'group relative panel-glass p-3 transition-all cursor-pointer hover:ring-1',
        isOverdueVariant && 'border-destructive/40 bg-destructive/5 hover:ring-destructive/50',
        isTodayVariant && 'border-amber-500/30 bg-amber-500/5 hover:ring-amber-500/50',
        isUpcomingVariant && 'border-cyan-500/30 bg-cyan-500/5 hover:ring-cyan-500/50',
        isActioning && 'opacity-50 pointer-events-none'
      )}
      onClick={handleCardClick}
    >
      {/* Content */}
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div 
          className={cn(
            'mt-1 h-2 w-2 rounded-full flex-shrink-0',
            isOverdueVariant && 'bg-destructive animate-pulse',
            isTodayVariant && 'bg-amber-500',
            isUpcomingVariant && 'bg-cyan-500'
          )} 
        />
        
        <div className="flex-1 min-w-0">
          {/* Action text */}
          <p className="font-medium text-sm leading-snug break-words">
            {reminder.actionText}
          </p>
          
          {/* Due label */}
          <p 
            className={cn(
              'text-xs mt-1',
              isOverdueVariant && 'text-destructive',
              isTodayVariant && 'text-amber-600 dark:text-amber-400',
              isUpcomingVariant && 'text-cyan-600 dark:text-cyan-400'
            )}
          >
            {dueLabel}
          </p>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Done */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-green-500/20 hover:text-green-600"
            onClick={handleDone}
            disabled={isActioning}
          >
            <Check className="h-4 w-4" />
          </Button>
          
          {/* Snooze dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-amber-500/20 hover:text-amber-600"
                disabled={isActioning}
              >
                <Clock className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
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
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
            onClick={handleDismiss}
            disabled={isActioning}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
