import { useState, useRef, useCallback } from 'react';
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

// Swipe thresholds
const TRIGGER_THRESHOLD = 80;
const MAX_TRANSLATE = 120;

export function ReminderCard({ reminder, variant, onAction }: ReminderCardProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const [isActioning, setIsActioning] = useState(false);
  
  // Swipe state
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    isTracking: boolean;
    isHorizontal: boolean | null;
  }>({ startX: 0, startY: 0, isTracking: false, isHorizontal: null });
  
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
  
  // Swipe handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isActioning) return;
    // Only track touch or pen, not mouse (unless you want mouse too)
    if (e.pointerType === 'mouse') return;
    
    swipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isTracking: true,
      isHorizontal: null,
    };
    setIsSwiping(false);
  }, [isActioning]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ref = swipeRef.current;
    if (!ref.isTracking || isActioning) return;
    
    const deltaX = e.clientX - ref.startX;
    const deltaY = e.clientY - ref.startY;
    
    // Determine direction on first significant movement
    if (ref.isHorizontal === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        ref.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        if (!ref.isHorizontal) {
          // Vertical scroll - cancel tracking
          ref.isTracking = false;
          return;
        }
      } else {
        return; // Wait for more movement
      }
    }
    
    if (!ref.isHorizontal) return;
    
    // Clamp translate
    const clampedX = Math.max(-MAX_TRANSLATE, Math.min(MAX_TRANSLATE, deltaX));
    setTranslateX(clampedX);
    setIsSwiping(true);
  }, [isActioning]);
  
  const handlePointerUp = useCallback(async () => {
    const ref = swipeRef.current;
    ref.isTracking = false;
    ref.isHorizontal = null;
    
    if (!isSwiping || isActioning) {
      setTranslateX(0);
      setIsSwiping(false);
      return;
    }
    
    // Check if threshold reached
    if (translateX >= TRIGGER_THRESHOLD) {
      // Swipe right → Done
      setTranslateX(0);
      setIsSwiping(false);
      await handleDone();
    } else if (translateX <= -TRIGGER_THRESHOLD) {
      // Swipe left → Dismiss
      setTranslateX(0);
      setIsSwiping(false);
      await handleDismiss();
    } else {
      // Snap back
      setTranslateX(0);
      setIsSwiping(false);
    }
  }, [isSwiping, isActioning, translateX, handleDone, handleDismiss]);
  
  const handlePointerCancel = useCallback(() => {
    swipeRef.current.isTracking = false;
    swipeRef.current.isHorizontal = null;
    setTranslateX(0);
    setIsSwiping(false);
  }, []);
  
  const dueLabel = formatDueDate(reminder.dueAt, language);
  const isOverdueVariant = variant === 'overdue';
  const isTodayVariant = variant === 'today';
  const isUpcomingVariant = variant === 'upcoming';
  
  const handleCardClick = () => {
    // Don't navigate if swiping
    if (isSwiping || Math.abs(translateX) > 5) return;
    if (reminder.id) {
      navigate(`/reminder/${reminder.id}`);
    }
  };
  
  // Calculate background reveal intensity (0-1)
  const swipeProgress = Math.abs(translateX) / TRIGGER_THRESHOLD;
  const isSwipeRight = translateX > 0;
  const isSwipeLeft = translateX < 0;
  
  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Background reveal layers */}
      {isSwiping && (
        <>
          {/* Green Done background (swipe right) */}
          <div 
            className={cn(
              'absolute inset-0 flex items-center pl-4 rounded-lg transition-opacity',
              'bg-green-500/20'
            )}
            style={{ opacity: isSwipeRight ? Math.min(swipeProgress, 1) : 0 }}
          >
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">
                {language === 'ru' ? 'Готово' : 'Done'}
              </span>
            </div>
          </div>
          
          {/* Red Dismiss background (swipe left) */}
          <div 
            className={cn(
              'absolute inset-0 flex items-center justify-end pr-4 rounded-lg transition-opacity',
              'bg-destructive/20'
            )}
            style={{ opacity: isSwipeLeft ? Math.min(swipeProgress, 1) : 0 }}
          >
            <div className="flex items-center gap-2 text-destructive">
              <span className="text-sm font-medium">
                {language === 'ru' ? 'Отклонить' : 'Dismiss'}
              </span>
              <X className="h-5 w-5" />
            </div>
          </div>
        </>
      )}
      
      {/* Main card content */}
      <div 
        className={cn(
          'group relative panel-glass p-3 transition-all cursor-pointer hover:ring-1',
          isOverdueVariant && 'border-destructive/40 bg-destructive/5 hover:ring-destructive/50',
          isTodayVariant && 'border-amber-500/30 bg-amber-500/5 hover:ring-amber-500/50',
          isUpcomingVariant && 'border-cyan-500/30 bg-cyan-500/5 hover:ring-cyan-500/50',
          isActioning && 'opacity-50 pointer-events-none',
          isSwiping && 'transition-none'
        )}
        style={{ 
          transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
        }}
        onClick={handleCardClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
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
    </div>
  );
}
