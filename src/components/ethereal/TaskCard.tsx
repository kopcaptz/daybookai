import { useState } from 'react';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, AlertTriangle, Calendar, User, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { EtherealTask } from '@/lib/etherealDb';

interface TaskCardProps {
  task: EtherealTask;
  onToggle: () => void;
  onTap: () => void;
  onDelete?: () => void;
}

export function TaskCard({ task, onToggle, onTap, onDelete }: TaskCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const isDone = task.status === 'done';
  const isUrgent = task.priority === 'urgent';
  const isOverdue = task.dueAtMs && isPast(task.dueAtMs) && !isDone;

  // Format due date
  const formatDueDate = () => {
    if (!task.dueAtMs) return null;
    const date = new Date(task.dueAtMs);
    if (isToday(date)) return 'сегодня';
    if (isTomorrow(date)) return 'завтра';
    return format(date, 'd MMM', { locale: ru });
  };

  const dueText = formatDueDate();

  // Touch handlers for swipe-to-delete
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = touchStartX - e.touches[0].clientX;
    // Only allow left swipe
    if (diff > 0) {
      setSwipeX(Math.min(diff, 100));
    } else {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (swipeX > 60 && onDelete) {
      onDelete();
    }
    setSwipeX(0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete background */}
      <div 
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-destructive transition-opacity",
          swipeX > 30 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: swipeX }}
      >
        <Trash2 className="w-5 h-5 text-destructive-foreground" />
      </div>

      {/* Card content */}
      <div
        className={cn(
          "relative bg-card border rounded-lg p-3 transition-transform",
          isDone && "opacity-60"
        )}
        style={{ transform: `translateX(-${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div 
            className="pt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <Checkbox 
              checked={isDone}
              className={cn(
                "w-5 h-5",
                isUrgent && !isDone && "border-destructive data-[state=checked]:bg-destructive"
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0" onClick={onTap}>
            {/* Title */}
            <div className="flex items-center gap-2">
              {isUrgent && !isDone && (
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span 
                className={cn(
                  "font-medium line-clamp-2",
                  isDone && "line-through text-muted-foreground"
                )}
              >
                {task.title}
              </span>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              {/* Assignee */}
              {task.assigneeName && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {task.assigneeName}
                </span>
              )}

              {/* Due date */}
              {dueText && (
                <span className={cn(
                  "flex items-center gap-1",
                  isOverdue && "text-destructive font-medium"
                )}>
                  <Calendar className="w-3 h-3" />
                  до {dueText}
                </span>
              )}

              {/* Urgent badge */}
              {isUrgent && !isDone && (
                <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-medium">
                  На мостике!
                </span>
              )}
            </div>

            {/* Completed by */}
            {isDone && task.completedByName && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Check className="w-3 h-3" />
                Завершил: {task.completedByName}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
