import { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, Camera, Mic, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, isBackfillDone, backfillAttachmentCounts, type AttachmentCounts } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useI18n, isRTL } from '@/lib/i18n';

// Day info for calendar cells
interface DayInfo {
  hasEntries: boolean;
  avgMood: number | null;
  attachmentCounts: AttachmentCounts | null;
}

function CalendarContent() {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daysInfo, setDaysInfo] = useState<Map<string, DayInfo>>(new Map());
  const backfillTriggered = useRef(false);

  // Trigger backfill once on first render (lazy, non-blocking)
  useEffect(() => {
    if (backfillTriggered.current) return;
    backfillTriggered.current = true;
    
    // Run backfill in background (non-blocking)
    if (!isBackfillDone()) {
      // Small delay to not block initial render
      setTimeout(() => {
        backfillAttachmentCounts().catch(err => {
          console.error('[Backfill] Error:', err);
        });
      }, 500);
    }
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = monthStart.getDay();
  const paddingDays = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  // Memoize date strings to avoid unnecessary re-renders
  const monthStartStr = useMemo(() => format(monthStart, 'yyyy-MM-dd'), [monthStart.getTime()]);
  const monthEndStr = useMemo(() => format(monthEnd, 'yyyy-MM-dd'), [monthEnd.getTime()]);

  // Range query: only entries for current month (uses 'date' index)
  const entries = useLiveQuery(
    () => db.entries.where('date').between(monthStartStr, monthEndStr, true, true).toArray(),
    [monthStartStr, monthEndStr]
  );

  useEffect(() => {
    if (!entries) return;
    
    const infoMap = new Map<string, DayInfo>();
    // Group entries by date: collect moods and aggregate attachmentCounts
    const entriesByDate = new Map<string, { moods: number[]; counts: AttachmentCounts }>();
    
    entries.forEach((entry) => {
      const existing = entriesByDate.get(entry.date) ?? { 
        moods: [], 
        counts: { image: 0, video: 0, audio: 0 } 
      };
      existing.moods.push(entry.mood);
      
      // Aggregate attachment counts from all entries on this date
      if (entry.attachmentCounts) {
        existing.counts.image += entry.attachmentCounts.image || 0;
        existing.counts.video += entry.attachmentCounts.video || 0;
        existing.counts.audio += entry.attachmentCounts.audio || 0;
      }
      
      entriesByDate.set(entry.date, existing);
    });

    entriesByDate.forEach(({ moods, counts }, date) => {
      const avgMood = Math.round(moods.reduce((a, b) => a + b, 0) / moods.length);
      const hasAttachments = counts.image > 0 || counts.video > 0 || counts.audio > 0;
      infoMap.set(date, { 
        hasEntries: true, 
        avgMood,
        attachmentCounts: hasAttachments ? counts : null
      });
    });

    setDaysInfo(infoMap);
  }, [entries]);

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    navigate(`/day/${dateStr}`);
  };

  const getMoodColor = (mood: number | null) => {
    if (mood === null) return '';
    const colors = ['bg-mood-1/20', 'bg-mood-2/20', 'bg-mood-3/20', 'bg-mood-4/20', 'bg-mood-5/20'];
    return colors[mood - 1] || '';
  };

  const weekDaysBase = [
    t('calendar.mon'),
    t('calendar.tue'),
    t('calendar.wed'),
    t('calendar.thu'),
    t('calendar.fri'),
    t('calendar.sat'),
    t('calendar.sun'),
  ];
  const weekDays = isRTL(language) ? [...weekDaysBase].reverse() : weekDaysBase;

  // Get localized month name
  const getMonthName = (date: Date): string => {
    const monthIndex = date.getMonth();
    const monthKeys = [
      'calendar.january', 'calendar.february', 'calendar.march', 'calendar.april',
      'calendar.may', 'calendar.june', 'calendar.july', 'calendar.august',
      'calendar.september', 'calendar.october', 'calendar.november', 'calendar.december'
    ] as const;
    return t(monthKeys[monthIndex]);
  };

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
        {/* Brand header */}
        <div className="flex items-center justify-between rtl:flex-row-reverse mb-4">
          <div className="relative shrink-0 w-8">
            <Calendar className="h-6 w-6 text-cyber-sigil" />
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
              {t('app.name')}
            </h1>
            <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
              {t('app.subtitle')}
            </p>
          </div>
          <div className="shrink-0 w-8" />
        </div>

        {/* Month navigation - icon swap for RTL */}
        {(() => {
          const PrevIcon = isRTL(language) ? ChevronRight : ChevronLeft;
          const NextIcon = isRTL(language) ? ChevronLeft : ChevronRight;
          return (
            <div className="flex items-center justify-between rtl:flex-row-reverse">
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="hover:bg-cyber-glow/10">
                <PrevIcon className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-serif font-medium">
                {getMonthName(currentMonth)} <span dir="ltr">{currentMonth.getFullYear()}</span>
              </h2>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} className="hover:bg-cyber-glow/10">
                <NextIcon className="h-5 w-5" />
              </Button>
            </div>
          );
        })()}

        {/* Rune divider */}
        <div className="mt-4 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>

      <main className="px-4 pt-4">
        {/* Week day headers - RTL grid direction */}
        <div className="mb-2 grid grid-cols-7 gap-1 text-center">
          {weekDays.map((day) => (
            <div key={day} className="py-2 text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid - RTL grid direction */}
        <div className="panel-glass p-3">
          <div className="grid grid-cols-7 gap-1">
            {/* Padding days */}
            {Array.from({ length: paddingDays }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}

            {/* Actual days */}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const info = daysInfo.get(dateStr);
              const hasEntries = info?.hasEntries || false;
              const avgMood = info?.avgMood ?? null;
              const counts = info?.attachmentCounts;

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'calendar-day-cyber aspect-square text-sm transition-all active:scale-95 relative',
                    isToday(day) && 'today',
                    hasEntries && [getMoodColor(avgMood), 'has-entries']
                  )}
                >
                  {/* Day number */}
                  <span className={cn(
                    'flex h-full items-center justify-center rounded-md',
                    isToday(day) && 'font-bold text-cyber-sigil',
                    counts && 'pb-2.5' // Make room for attachment indicators
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  {/* Attachment indicators (only if counts exist) */}
                  {counts && (
                    <div className="absolute bottom-0.5 left-0 right-0 flex items-center justify-center gap-0.5">
                      {counts.image > 0 && (
                        <span className="flex items-center text-[9px] text-muted-foreground/80">
                          <Camera className="h-2.5 w-2.5" />
                          {counts.image > 1 && <span className="ml-px">{counts.image}</span>}
                        </span>
                      )}
                      {counts.audio > 0 && (
                        <span className="flex items-center text-[9px] text-muted-foreground/80">
                          <Mic className="h-2.5 w-2.5" />
                          {counts.audio > 1 && <span className="ml-px">{counts.audio}</span>}
                        </span>
                      )}
                      {counts.video > 0 && (
                        <span className="flex items-center text-[9px] text-muted-foreground/80">
                          <Video className="h-2.5 w-2.5" />
                          {counts.video > 1 && <span className="ml-px">{counts.video}</span>}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <ErrorBoundary>
      <CalendarContent />
    </ErrorBoundary>
  );
}
