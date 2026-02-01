import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Brain, Check, Sparkles } from 'lucide-react';

interface MoodSelectorProps {
  value: number;
  onChange: (value: number) => void;
  suggestedMood?: number | null;
  confirmedMood?: number | null;
  isAnalyzing?: boolean;
  isAIAnalyzing?: boolean;
  suggestionSource?: 'local' | 'ai' | 'discussion' | 'entry' | null;
  onSuggestionAccept?: () => void;
  onBlur?: () => void;
}

// Cyber mood symbols
const moodEmojis = ['😢', '😔', '😐', '🙂', '😊'];

export function MoodSelector({ 
  value, 
  onChange, 
  suggestedMood,
  confirmedMood,
  isAnalyzing,
  isAIAnalyzing,
  suggestionSource,
  onSuggestionAccept,
  onBlur,
}: MoodSelectorProps) {
  const { t, language } = useI18n();
  
  const moodLabels = [
    t('mood.1'),
    t('mood.2'),
    t('mood.3'),
    t('mood.4'),
    t('mood.5'),
  ];

  const handleMoodClick = (mood: number) => {
    onChange(mood);
    // If clicking on suggested mood, call accept handler
    if (mood === suggestedMood && onSuggestionAccept) {
      onSuggestionAccept();
    }
  };

  // Get source label for suggestion
  const getSourceLabel = () => {
    if (!suggestionSource) return '';
    switch (suggestionSource) {
      case 'local':
        return language === 'ru' ? 'локально' : 'local';
      case 'ai':
        return language === 'ru' ? 'AI' : 'AI';
      case 'discussion':
        return language === 'ru' ? 'из чата' : 'from chat';
      case 'entry':
        return language === 'ru' ? 'из записи' : 'from entry';
      default:
        return '';
    }
  };

  // Determine which indicator to show
  const isAISource = suggestionSource === 'ai';
  const isLocalSource = suggestionSource === 'local';
  const showAnalyzingIndicator = isAnalyzing || isAIAnalyzing;
  const showBrainIndicator = showAnalyzingIndicator || (suggestionSource !== null && !isAISource);
  const showSparklesIndicator = isAISource || isAIAnalyzing;

  return (
    <div className="space-y-4 panel-glass p-4" onBlur={onBlur}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t('mood.title')}</span>
          {/* Source indicators */}
          {showSparklesIndicator && (
            <span className="flex items-center gap-1 text-xs text-cyber-glow font-medium">
              <Sparkles className={cn("h-3 w-3", isAIAnalyzing && "animate-pulse")} />
              {!isAIAnalyzing && suggestedMood && (
                <span className="animate-pulse">
                  → {moodEmojis[suggestedMood - 1]}?
                </span>
              )}
              {!isAIAnalyzing && isAISource && !suggestedMood && (
                <span className="hidden sm:inline text-cyber-glow/70">AI</span>
              )}
            </span>
          )}
          {showBrainIndicator && !showSparklesIndicator && (
            <span className="flex items-center gap-1 text-xs text-cyber-sigil font-medium">
              <Brain className={cn("h-3 w-3", isAnalyzing && "animate-pulse")} />
              {!isAnalyzing && suggestedMood && (
                <span className="animate-pulse">
                  → {moodEmojis[suggestedMood - 1]}?
                </span>
              )}
              {!isAnalyzing && !suggestedMood && suggestionSource && (
                <span className="hidden sm:inline text-cyber-sigil/70">{getSourceLabel()}</span>
              )}
            </span>
          )}
          {/* Confirmed indicator */}
          {confirmedMood !== null && confirmedMood === value && !showAnalyzingIndicator && (
            <span className="flex items-center gap-1 text-xs text-green-500/80">
              <Check className="h-3 w-3" />
              {isAISource && (
                <Sparkles className="h-2.5 w-2.5 text-cyber-glow/60" />
              )}
              <span className="hidden sm:inline">
                {language === 'ru' ? 'подтверждено' : 'confirmed'}
              </span>
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {moodEmojis[value - 1]} {moodLabels[value - 1]}
        </span>
      </div>
      
      <div className="relative py-2 pb-6">
        {/* Background track */}
        <div className="h-1.5 w-full rounded-full bg-muted" />
        
        {/* Filled gradient bar */}
        <div 
          className="absolute left-0 top-2 h-1.5 rounded-full transition-all duration-300"
          style={{ 
            width: `${((value - 1) / 4) * 100}%`,
            background: 'linear-gradient(90deg, hsl(var(--glow-primary)), hsl(var(--glow-secondary)))',
            boxShadow: '0 0 10px hsl(var(--glow-primary) / 0.5)'
          }}
        />
        
        {/* Mood buttons */}
        <div className="absolute inset-0 flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((mood) => {
            const isSelected = value === mood;
            const isSuggested = suggestedMood === mood && !isSelected;
            const isConfirmed = confirmedMood === mood && isSelected;
            const isSuggestedByAI = isSuggested && isAISource;
            
            return (
              <button
                key={mood}
                type="button"
                onClick={() => handleMoodClick(mood)}
                className={cn(
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-md text-lg transition-all duration-200',
                  'border',
                  isSelected
                    ? 'bg-cyber-glow/10 border-cyber-glow/40 shadow-[0_0_12px_hsl(var(--glow-primary)/0.3)] scale-110'
                    : isSuggestedByAI
                    ? 'bg-cyber-glow/15 border-cyber-glow/60 shadow-[0_0_16px_hsl(var(--glow-primary)/0.4)] scale-105'
                    : isSuggested
                    ? 'bg-cyber-sigil/10 border-cyber-sigil/50 shadow-[0_0_12px_hsl(var(--cyber-sigil)/0.3)] scale-105'
                    : 'bg-card border-border/50 hover:border-cyber-glow/30 hover:bg-cyber-glow/5'
                )}
              >
                {moodEmojis[mood - 1]}
                {/* Selected indicator (sigil pulse) */}
                {isSelected && !isConfirmed && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-sigil animate-sigil-pulse" />
                )}
                {/* Confirmed indicator (green checkmark + optional AI sparkle) */}
                {isConfirmed && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500/90 flex items-center justify-center shadow-sm">
                    <Check className="h-2 w-2 text-white" />
                  </span>
                )}
                {/* AI Suggestion indicators - more prominent */}
                {isSuggestedByAI && (
                  <>
                    {/* Glowing dashed border */}
                    <span className="absolute inset-0 rounded-md border-2 border-dashed border-cyber-glow animate-pulse" />
                    {/* Sparkles indicator */}
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-cyber-glow text-xs font-bold animate-bounce flex items-center gap-0.5">
                      <Sparkles className="h-3 w-3" />
                    </span>
                    {/* Glow dot at top-right */}
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyber-glow shadow-[0_0_10px_hsl(var(--glow-primary))] animate-pulse" />
                  </>
                )}
                {/* Local suggestion indicators */}
                {isSuggested && !isSuggestedByAI && (
                  <>
                    {/* Pulsing dashed border */}
                    <span className="absolute inset-0 rounded-md border-2 border-dashed border-cyber-sigil animate-pulse" />
                    {/* Bouncing arrow below */}
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-cyber-sigil text-sm font-bold animate-bounce">
                      ↑
                    </span>
                    {/* Glow dot at top-right */}
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyber-sigil shadow-[0_0_8px_hsl(var(--cyber-sigil))] animate-pulse" />
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MoodBadge({ mood }: { mood: number }) {
  const badgeColors: Record<number, string> = {
    1: 'bg-mood-1/20 border-mood-1/40',
    2: 'bg-mood-2/20 border-mood-2/40',
    3: 'bg-mood-3/20 border-mood-3/40',
    4: 'bg-mood-4/20 border-mood-4/40',
    5: 'bg-mood-5/20 border-mood-5/40',
  };

  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm border transition-transform hover:scale-105',
        badgeColors[mood] || badgeColors[3]
      )}
    >
      {moodEmojis[mood - 1]}
    </span>
  );
}
