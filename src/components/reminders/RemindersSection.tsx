import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, AlertCircle, Clock, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { db, type Reminder } from '@/lib/db';
import { 
  getStartOfTodayTimestamp, 
  getEndOfTodayTimestamp,
  getNowPlus24hTimestamp 
} from '@/lib/reminderUtils';
import { ReminderCard } from './ReminderCard';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

/**
 * Query overdue reminders (due before start of today, pending, not snoozed).
 */
function useOverdueReminders() {
  return useLiveQuery(async () => {
    const startOfToday = getStartOfTodayTimestamp();
    const now = Date.now();
    
    const reminders = await db.reminders
      .where('status')
      .equals('pending')
      .filter(r => 
        r.dueAt < startOfToday && 
        (!r.snoozedUntil || r.snoozedUntil <= now)
      )
      .toArray();
    
    // Sort by dueAt ascending (oldest first)
    return reminders.sort((a, b) => a.dueAt - b.dueAt);
  }, []);
}

/**
 * Query today's reminders (due today, pending, not snoozed).
 */
function useTodayReminders() {
  return useLiveQuery(async () => {
    const startOfToday = getStartOfTodayTimestamp();
    const endOfToday = getEndOfTodayTimestamp();
    const now = Date.now();
    
    const reminders = await db.reminders
      .where('status')
      .equals('pending')
      .filter(r => 
        r.dueAt >= startOfToday && 
        r.dueAt <= endOfToday &&
        (!r.snoozedUntil || r.snoozedUntil <= now)
      )
      .toArray();
    
    // Sort by dueAt ascending (soonest first)
    return reminders.sort((a, b) => a.dueAt - b.dueAt);
  }, []);
}

/**
 * Query upcoming reminders (due within next 24h from now, after today ends, pending, not snoozed).
 */
function useUpcomingReminders() {
  return useLiveQuery(async () => {
    const endOfToday = getEndOfTodayTimestamp();
    const now = Date.now();
    const upper = getNowPlus24hTimestamp();
    
    const reminders = await db.reminders
      .where('status')
      .equals('pending')
      .filter(r => 
        (!r.snoozedUntil || r.snoozedUntil <= now) &&
        r.dueAt > endOfToday &&
        r.dueAt <= upper
      )
      .toArray();
    
    // Sort by dueAt ascending (soonest first)
    return reminders.sort((a, b) => a.dueAt - b.dueAt);
  }, []);
}

export function RemindersSection() {
  const { language } = useI18n();
  const overdue = useOverdueReminders();
  const today = useTodayReminders();
  const upcoming = useUpcomingReminders();
  
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  
  // Loading state
  if (overdue === undefined || today === undefined || upcoming === undefined) {
    return null;
  }
  
  // Nothing to show
  if (overdue.length === 0 && today.length === 0 && upcoming.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3 mb-4">
      {/* Overdue section - collapsible with red accent */}
      {overdue.length > 0 && (
        <Collapsible open={overdueOpen} onOpenChange={setOverdueOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full group">
            <div className="flex items-center gap-2 flex-1">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {language === 'ru' ? 'Просрочено' : 'Overdue'}
              </span>
              <span className="text-xs text-destructive/70 bg-destructive/10 px-1.5 py-0.5 rounded">
                {overdue.length}
              </span>
            </div>
            <ChevronDown 
              className={cn(
                'h-4 w-4 text-destructive/60 transition-transform',
                overdueOpen && 'rotate-180'
              )} 
            />
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-2 space-y-2">
            {overdue.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                variant="overdue"
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* Today section - amber accent */}
      {today.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {language === 'ru' ? 'Сегодня' : 'Today'}
            </span>
            <span className="text-xs text-amber-600/70 dark:text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {today.length}
            </span>
          </div>
          
          <div className="space-y-2">
            {today.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                variant="today"
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Upcoming section - collapsible with cyan accent */}
      {upcoming.length > 0 && (
        <Collapsible open={upcomingOpen} onOpenChange={setUpcomingOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full group">
            <div className="flex items-center gap-2 flex-1">
              <CalendarClock className="h-4 w-4 text-cyan-500" />
              <span className="text-sm font-medium text-cyan-600 dark:text-cyan-400">
                {language === 'ru' ? 'Скоро' : 'Upcoming'}
              </span>
              <span className="text-xs text-cyan-600/70 dark:text-cyan-400/70 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                {upcoming.length}
              </span>
            </div>
            <ChevronDown 
              className={cn(
                'h-4 w-4 text-cyan-500/60 transition-transform',
                upcomingOpen && 'rotate-180'
              )} 
            />
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-2 space-y-2">
            {upcoming.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                variant="upcoming"
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
