import { cn } from '@/lib/utils';
import { LEVEL_LABELS } from '@/lib/gameService';

interface AdultLevelSelectorProps {
  value: number;
  onChange: (level: number) => void;
  disabled?: boolean;
  maxLevel?: number;
}

export function AdultLevelSelector({
  value,
  onChange,
  disabled = false,
  maxLevel = 3,
}: AdultLevelSelectorProps) {
  const levels = LEVEL_LABELS.filter((l) => l.level <= maxLevel);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        Уровень игры
      </label>
      <div className="grid grid-cols-2 gap-2">
        {levels.map((level) => (
          <button
            key={level.level}
            type="button"
            onClick={() => onChange(level.level)}
            disabled={disabled}
            className={cn(
              'p-3 rounded-lg border text-left transition-all',
              'hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed',
              value === level.level
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{level.name}</span>
              {level.icon && (
                <span className="text-sm">{level.icon}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {level.description}
            </p>
          </button>
        ))}
      </div>

      {value > 0 && (
        <p className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded-lg">
          Для уровней 1-3 требуется согласие обоих партнёров.
        </p>
      )}
    </div>
  );
}
