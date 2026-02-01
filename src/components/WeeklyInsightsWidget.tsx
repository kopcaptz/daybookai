import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Smile, Bell, Flame, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { getWeeklyStats, type WeeklyStats } from '@/lib/db';
import { getOrGenerateWeeklyInsight, getCachedWeeklyInsight, type WeeklyInsight } from '@/lib/weeklyInsightsService';
import { useAIAccess } from '@/hooks/useAIAccess';
import { loadAISettings } from '@/lib/aiConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AIPinDialog } from '@/components/AIPinDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

function getTrendSymbol(trend: WeeklyStats['moodTrend']): string {
  switch (trend) {
    case 'up': return '↗';
    case 'down': return '↘';
    default: return '→';
  }
}

function formatRelativeTime(timestamp: number, language: 'ru' | 'en'): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return language === 'ru' ? 'только что' : 'just now';
  if (minutes < 60) return language === 'ru' ? `${minutes}м назад` : `${minutes}m ago`;
  if (hours < 24) return language === 'ru' ? `${hours}ч назад` : `${hours}h ago`;
  return language === 'ru' ? `${days}д назад` : `${days}d ago`;
}

function scrollToReminders() {
  const el = document.getElementById('reminders-section');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function WeeklyInsightsWidget() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const aiSettings = loadAISettings();
  const { hasValidToken, showPinDialog, openPinDialog, closePinDialog, verifyPin, isVerifying } = useAIAccess(language);
  
  const stats = useLiveQuery(() => getWeeklyStats(), []);
  
  // AI Insight state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInsightSheet, setShowInsightSheet] = useState(false);
  const [insight, setInsight] = useState<WeeklyInsight | null>(null);
  
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
    streak: language === 'ru' ? 'Серия' : 'Streak',
    weekSummary: language === 'ru' ? 'Обзор недели' : 'Week Summary',
    sheetTitle: language === 'ru' ? '✨ Резонанс недели' : '✨ Week Resonance',
    themes: language === 'ru' ? 'Доминирующие контуры' : 'Dominant Themes',
    moodPatternLabel: language === 'ru' ? 'Паттерн настроения' : 'Mood Pattern',
    insightLabel: language === 'ru' ? '💡 Инсайт' : '💡 Insight',
    suggestionLabel: language === 'ru' ? '🎯 Рекомендация' : '🎯 Suggestion',
    generating: language === 'ru' ? 'Генерация...' : 'Generating...',
    refreshButton: language === 'ru' ? 'Обновить' : 'Refresh',
    refreshing: language === 'ru' ? 'Обновление...' : 'Refreshing...',
    refreshed: language === 'ru' ? 'Обновлено' : 'Refreshed',
  };
  
  // Show AI button only if AI is enabled and we have at least 3 entries
  const canShowAIButton = aiSettings.enabled && stats.entries7d >= 3;
  
  const handleGenerateInsight = async () => {
    // Check if we have a cached insight first
    const cached = await getCachedWeeklyInsight();
    if (cached) {
      setInsight(cached);
      setShowInsightSheet(true);
      return;
    }
    
    // Need valid token for generation
    if (!hasValidToken) {
      openPinDialog();
      return;
    }
    
    setIsGenerating(true);
    try {
      const result = await getOrGenerateWeeklyInsight(language);
      
      if (result.success === true) {
        setInsight(result.insight);
        setShowInsightSheet(true);
      } else {
        // Handle specific errors
        const errorCode = result.error;
        if (errorCode === 'token_invalid') {
          openPinDialog();
        } else if (errorCode === 'rate_limit_exceeded') {
          toast.error(language === 'ru' ? 'Слишком много запросов. Подождите немного.' : 'Too many requests. Please wait.');
        } else if (errorCode === 'not_enough_entries') {
          toast.error(language === 'ru' ? 'Недостаточно записей для анализа' : 'Not enough entries for analysis');
        } else {
          toast.error(language === 'ru' ? 'Ошибка генерации' : 'Generation failed');
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleRefreshInsight = async () => {
    if (!hasValidToken) {
      openPinDialog();
      return;
    }
    
    setIsRefreshing(true);
    try {
      const result = await getOrGenerateWeeklyInsight(language, true); // force=true
      
      if (result.success === true) {
        setInsight(result.insight);
        toast.success(labels.refreshed);
      } else {
        const errorCode = result.error;
        if (errorCode === 'token_invalid') {
          openPinDialog();
        } else if (errorCode === 'rate_limit_exceeded') {
          toast.error(language === 'ru' ? 'Слишком много запросов. Подождите немного.' : 'Too many requests. Please wait.');
        } else {
          toast.error(language === 'ru' ? 'Ошибка обновления' : 'Refresh failed');
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  };
  
  return (
    <>
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
        
        {/* Metrics grid - 2x2 on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Entries count - tap to Calendar */}
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className={cn(
              "flex flex-col items-center text-center p-2 rounded-md",
              "cursor-pointer transition-colors",
              "hover:bg-accent/50 active:bg-accent/70"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <BookOpen className="h-4 w-4 text-cyber-sigil" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              {stats.entries7d}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {labels.entries}
            </span>
          </button>
          
          {/* Average mood - tap to Calendar */}
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className={cn(
              "flex flex-col items-center text-center p-2 rounded-md",
              "cursor-pointer transition-colors",
              "hover:bg-accent/50 active:bg-accent/70"
            )}
          >
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
          </button>
          
          {/* Streak - tap to Calendar */}
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className={cn(
              "flex flex-col items-center text-center p-2 rounded-md",
              "cursor-pointer transition-colors",
              "hover:bg-accent/50 active:bg-accent/70"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              {stats.streakDays}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {labels.streak}
            </span>
          </button>
          
          {/* Pending reminders - tap to scroll */}
          <button
            type="button"
            onClick={scrollToReminders}
            className={cn(
              "flex flex-col items-center text-center p-2 rounded-md",
              "cursor-pointer transition-colors",
              "hover:bg-accent/50 active:bg-accent/70"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Bell className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              {stats.pendingReminders}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {labels.reminders}
            </span>
          </button>
        </div>
        
        {/* AI Week Summary Button */}
        {canShowAIButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerateInsight}
            disabled={isGenerating}
            className={cn(
              "mt-3 w-full text-xs gap-1.5",
              "text-cyber-sigil hover:bg-cyber-sigil/10 hover:text-cyber-sigil",
              "border border-cyber-sigil/20"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {labels.generating}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {labels.weekSummary}
              </>
            )}
          </Button>
        )}
      </div>
      
      {/* Weekly Insight Sheet */}
      <Sheet open={showInsightSheet} onOpenChange={setShowInsightSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="text-lg font-serif">{labels.sheetTitle}</SheetTitle>
          </SheetHeader>
          
          {insight && (
            <div className="space-y-4 mt-4 pb-4">
              {/* Summary */}
              <p className="text-sm text-foreground leading-relaxed">
                {insight.summary}
              </p>
              
              {/* Dominant themes */}
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  {labels.themes}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {insight.dominantThemes.map((theme, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary"
                      className="text-xs"
                    >
                      {theme}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* Mood pattern */}
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {labels.moodPatternLabel}
                </h4>
                <p className="text-sm text-foreground">{insight.moodPattern}</p>
              </div>
              
              {/* Insight card */}
              <div className="p-3 bg-cyber-sigil/5 rounded-lg border border-cyber-sigil/20">
                <h4 className="text-xs text-cyber-sigil font-medium mb-1">
                  {labels.insightLabel}
                </h4>
                <p className="text-sm text-foreground">{insight.insight}</p>
              </div>
              
              {/* Suggestion card */}
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <h4 className="text-xs text-primary font-medium mb-1">
                  {labels.suggestionLabel}
                </h4>
                <p className="text-sm text-foreground">{insight.suggestion}</p>
              </div>
              
              {/* Meta info */}
              <p className="text-[10px] text-muted-foreground text-center">
                {language === 'ru' 
                  ? `Сгенерировано: ${formatRelativeTime(insight.generatedAt, language)} • ${insight.sourceEntryCount} записей` 
                  : `Generated: ${formatRelativeTime(insight.generatedAt, language)} • ${insight.sourceEntryCount} entries`}
              </p>
              
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshInsight}
                disabled={isRefreshing}
                className="w-full mt-3 text-xs gap-1.5"
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {labels.refreshing}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    {labels.refreshButton}
                  </>
                )}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      
      {/* AI PIN Dialog */}
      <AIPinDialog
        open={showPinDialog}
        onOpenChange={closePinDialog}
        onVerify={verifyPin}
        isVerifying={isVerifying}
        language={language}
      />
    </>
  );
}
