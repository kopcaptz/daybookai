import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface SituationCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'paper' | 'brass';
}

export function SituationCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
  variant = 'default',
}: SituationCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg p-4 transition-all',
        variant === 'default' && 'bg-card border border-border',
        variant === 'paper' &&
          'bg-[#f5f0e8] text-[#1a1612] border border-primary/30 shadow-md',
        variant === 'brass' &&
          'bg-card border-2 border-primary/50 shadow-lg shadow-primary/10',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {Icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
              variant === 'paper' ? 'bg-primary/20' : 'bg-primary/10'
            )}
          >
            <Icon
              className={cn(
                'w-5 h-5',
                variant === 'paper' ? 'text-primary' : 'text-primary'
              )}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'font-semibold text-base leading-tight',
              variant === 'paper' ? 'text-[#1a1612]' : 'text-foreground'
            )}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className={cn(
                'text-sm mt-0.5',
                variant === 'paper' ? 'text-[#1a1612]/70' : 'text-muted-foreground'
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          variant === 'paper' ? 'text-[#1a1612]' : 'text-foreground'
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface OptionButtonProps {
  id: string;
  text: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  variant?: 'paper' | 'default';
}

export function OptionButton({
  id,
  text,
  selected,
  disabled,
  onSelect,
  variant = 'default',
}: OptionButtonProps) {
  return (
    <button
      onClick={() => onSelect(id)}
      disabled={disabled}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'flex items-start gap-3',
        disabled && 'opacity-50 cursor-not-allowed',
        variant === 'paper'
          ? cn(
              'border-[#d4c9b8]',
              selected
                ? 'bg-primary/20 border-primary'
                : 'bg-[#faf7f2] hover:bg-[#f0ebe0]'
            )
          : cn(
              'border-border',
              selected
                ? 'bg-primary/20 border-primary'
                : 'bg-secondary hover:bg-secondary/80'
            )
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
          'text-sm font-bold',
          selected
            ? 'bg-primary text-primary-foreground'
            : variant === 'paper'
            ? 'bg-[#d4c9b8] text-[#1a1612]'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {id}
      </span>
      <span
        className={cn(
          'text-sm leading-relaxed pt-0.5',
          variant === 'paper' ? 'text-[#1a1612]' : 'text-foreground'
        )}
      >
        {text}
      </span>
    </button>
  );
}
