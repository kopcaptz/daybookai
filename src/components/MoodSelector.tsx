import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface MoodSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

// Cyber mood symbols
const moodEmojis = ['😢', '😔', '😐', '🙂', '😊'];

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  const { t } = useI18n();
  
  const moodLabels = [
    t('mood.1'),
    t('mood.2'),
    t('mood.3'),
    t('mood.4'),
    t('mood.5'),
  ];

  return (
    <div className="space-y-4 panel-glass p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('mood.title')}</span>
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
          {[1, 2, 3, 4, 5].map((mood) => (
            <button
              key={mood}
              type="button"
              onClick={() => onChange(mood)}
              className={cn(
                'relative z-10 flex h-10 w-10 items-center justify-center rounded-md text-lg transition-all duration-200',
                'border',
                value === mood
                  ? 'bg-cyber-glow/10 border-cyber-glow/40 shadow-[0_0_12px_hsl(var(--glow-primary)/0.3)] scale-110'
                  : 'bg-card border-border/50 hover:border-cyber-glow/30 hover:bg-cyber-glow/5'
              )}
            >
              {moodEmojis[mood - 1]}
              {value === mood && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-sigil animate-sigil-pulse" />
              )}
            </button>
          ))}
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
