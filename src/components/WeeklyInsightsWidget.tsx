import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Smile, Bell, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { getWeeklyStats, type WeeklyStats } from '@/lib/db';

function TrendIcon({ trend }: { trend: WeeklyStats['moodTrend'] }) {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
    case 'down':
      return <TrendingDown className="h-3.5 w-3.5 text-rose-500" />;
    default:
      return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getTrendSymbol(trend: WeeklyStats['moodTrend']): string {
  switch (trend) {
    case 'up': return '↗';
    case 'down': return '↘';
    default: return '→';
  }
}

export function WeeklyInsightsWidget() {
  const { language } = useI18n();
  
  const stats = useLiveQuery(() => getWeeklyStats(), []);
  
  // Don't render while loading
  if (!stats) {
    return null;
  }
  
  // Hide widget if no data (empty state)
  if (stats.entries7d === 0 && stats.pendingReminders === 0) {
    return null;
  }
  
  const labels = {
    title: language === 'ru' ? 'Неделя' : 'This week',
    entries: language === 'ru' ? 'Записей' : 'Entries',
    mood: language === 'ru' ? 'Настроение' : 'Mood',
    reminders: language === 'ru' ? 'Напоминаний' : 'Reminders',
  };
  
  return (
    <div 
      className={cn(
        "mb-4 p-4 rounded-lg",
        "bg-card/50 backdrop-blur-sm border border-border/50",
        "animate-fade-in"
      )}
    >
      {/* Title */}
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {labels.title}
      </h3>
      
      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Entries count */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="h-4 w-4 text-cyber-sigil" />
          </div>
          <span className="text-lg font-semibold text-foreground">
            {stats.entries7d}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {labels.entries}
          </span>
        </div>
        
        {/* Average mood */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 mb-1">
            <Smile className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-semibold text-foreground">
              {stats.avgMood7d !== null ? stats.avgMood7d.toFixed(1) : '—'}
            </span>
            {stats.avgMood7d !== null && (
              <span className={cn(
                "text-sm",
                stats.moodTrend === 'up' && "text-emerald-500",
                stats.moodTrend === 'down' && "text-rose-500",
                stats.moodTrend === 'flat' && "text-muted-foreground"
              )}>
                {getTrendSymbol(stats.moodTrend)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {labels.mood}
          </span>
        </div>
        
        {/* Pending reminders */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-1.5 mb-1">
            <Bell className="h-4 w-4 text-cyan-500" />
          </div>
          <span className="text-lg font-semibold text-foreground">
            {stats.pendingReminders}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {labels.reminders}
          </span>
        </div>
      </div>
    </div>
  );
}
