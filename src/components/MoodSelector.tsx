import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Brain } from 'lucide-react';

interface MoodSelectorProps {
  value: number;
  onChange: (value: number) => void;
  suggestedMood?: number | null;
  suggestionSource?: 'text' | 'discussion' | 'entry' | null;
  onSuggestionAccept?: () => void;
}

// Cyber mood symbols
const moodEmojis = ['😢', '😔', '😐', '🙂', '😊'];

export function MoodSelector({ 
  value, 
  onChange, 
  suggestedMood,
  suggestionSource,
  onSuggestionAccept,
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
      case 'text':
        return language === 'ru' ? 'из текста' : 'from text';
      case 'discussion':
        return language === 'ru' ? 'из чата' : 'from chat';
      case 'entry':
        return language === 'ru' ? 'из записи' : 'from entry';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4 panel-glass p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t('mood.title')}</span>
          {suggestedMood && suggestedMood !== value && (
            <span className="flex items-center gap-1 text-xs text-cyber-sigil/70">
              <Brain className="h-3 w-3" />
              <span className="hidden sm:inline">{getSourceLabel()}</span>
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {moodEmojis[value - 1]} {moodLabels[value - 1]}
        </span>
      </div>
      
      <div className="relative py-2">
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
                    : isSuggested
                    ? 'bg-cyber-sigil/5 border-cyber-sigil/30 hover:border-cyber-sigil/50 hover:bg-cyber-sigil/10'
                    : 'bg-card border-border/50 hover:border-cyber-glow/30 hover:bg-cyber-glow/5'
                )}
              >
                {moodEmojis[mood - 1]}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-sigil animate-sigil-pulse" />
                )}
                {/* Ghost dot for suggestions */}
                {isSuggested && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyber-sigil/50 animate-pulse" />
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
