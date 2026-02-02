import { Checkbox } from '@/components/ui/checkbox';
import { Boundaries } from '@/lib/gameService';

interface BoundariesSelectorProps {
  value: Boundaries;
  onChange: (boundaries: Boundaries) => void;
  disabled?: boolean;
}

const BOUNDARY_OPTIONS = [
  { key: 'noHumiliation', label: 'Без грубости и унижения' },
  { key: 'noPain', label: 'Без боли' },
  { key: 'noThirdParties', label: 'Без третьих лиц' },
  { key: 'noPastPartners', label: 'Без обсуждения прошлого опыта' },
  { key: 'romanceOnly', label: 'Только романтика (макс. уровень 1)' },
] as const;

export function BoundariesSelector({
  value,
  onChange,
  disabled = false,
}: BoundariesSelectorProps) {
  const handleChange = (key: keyof Boundaries, checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground">
        Ограничения
      </label>
      <div className="space-y-2">
        {BOUNDARY_OPTIONS.map((option) => (
          <label
            key={option.key}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
          >
            <Checkbox
              checked={value[option.key] || false}
              onCheckedChange={(checked) =>
                handleChange(option.key, checked === true)
              }
              disabled={disabled}
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Эти ограничения применяются к генерации ситуаций.
      </p>
    </div>
  );
}
