import { Moon } from 'lucide-react';
import { useMoonLongPress } from '@/hooks/useMoonLongPress';
import { cn } from '@/lib/utils';

interface SecretMoonProps {
  onUnlock: () => void;
}

export function SecretMoon({ onUnlock }: SecretMoonProps) {
  const { handlers, progress, isPressed } = useMoonLongPress({
    onSuccess: onUnlock,
    duration: 3000,
  });

  return (
    <div
      {...handlers}
      className={cn(
        'relative p-2 -m-2 cursor-pointer select-none touch-none',
        'transition-transform duration-200',
        isPressed && 'scale-110'
      )}
    >
      {/* Progress ring */}
      {isPressed && (
        <svg
          className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary/20"
          />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="100"
            strokeDashoffset={100 - progress}
            strokeLinecap="round"
            className="text-primary transition-all duration-100"
          />
        </svg>
      )}

      {/* Moon icon */}
      <Moon
        className={cn(
          'h-5 w-5 text-muted-foreground transition-all duration-300',
          isPressed && 'text-primary animate-pulse'
        )}
      />

      {/* Glow effect on completion approach */}
      {isPressed && progress > 80 && (
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
      )}
    </div>
  );
}
