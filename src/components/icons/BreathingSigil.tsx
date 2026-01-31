import { cn } from '@/lib/utils';
import { GrimoireIcon } from './SigilIcon';

interface BreathingSigilProps {
  className?: string;
  ritualActive?: boolean;
}

// Determine ambient glow color based on time of day
function getAmbientGlowClass(): string {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) {
    // Morning: warm amber
    return 'from-amber-500/20 via-primary/15 to-transparent';
  } else if (hour >= 12 && hour < 18) {
    // Day: neutral primary
    return 'from-primary/20 via-primary/10 to-transparent';
  } else if (hour >= 18 && hour < 22) {
    // Evening: violet tint
    return 'from-violet-500/20 via-accent/15 to-transparent';
  } else {
    // Night: cold cyan
    return 'from-cyan-400/20 via-primary/15 to-transparent';
  }
}

export function BreathingSigil({ className, ritualActive = false }: BreathingSigilProps) {
  const ambientGlow = getAmbientGlowClass();
  
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Ambient glow base */}
      <div 
        className={cn(
          "absolute w-40 h-40 rounded-full bg-gradient-radial blur-2xl transition-all duration-500",
          ambientGlow,
          ritualActive && "scale-125 opacity-80"
        )}
      />
      
      {/* Orbital particles container */}
      <div className="absolute w-32 h-32">
        {/* Particle 1 - Slow orbit */}
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-cyber-glow shadow-[0_0_6px_hsl(var(--glow-primary))]",
            "animate-orbit-slow",
            ritualActive && "animate-orbit-fast"
          )}
          style={{ marginTop: '-3px', marginLeft: '-3px' }}
        />
        
        {/* Particle 2 - Medium orbit */}
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-cyber-rune shadow-[0_0_4px_hsl(var(--rune))]",
            "animate-orbit-medium",
            ritualActive && "animate-orbit-fast"
          )}
          style={{ marginTop: '-2px', marginLeft: '-2px' }}
        />
        
        {/* Particle 3 - Fast orbit (counter) */}
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-cyber-sigil/60 shadow-[0_0_6px_hsl(var(--sigil)/0.6)]",
            "animate-orbit-counter",
            ritualActive && "animate-orbit-fast-counter"
          )}
          style={{ marginTop: '-3px', marginLeft: '-3px' }}
        />
      </div>
      
      {/* Ritual ripple effect */}
      {ritualActive && (
        <div className="absolute w-24 h-24 rounded-full border border-cyber-sigil/40 animate-ritual-ripple" />
      )}
      
      {/* Glass container with breathing sigil */}
      <div 
        className={cn(
          "relative p-8 panel-glass",
          "transition-all duration-300",
          ritualActive && "scale-110 cyber-glow-strong"
        )}
      >
        {/* Seal glyph accents */}
        <div className="absolute top-2 right-2 text-cyber-sigil/40 text-[8px]">◇</div>
        <div className="absolute bottom-2 left-2 text-cyber-rune/30 text-[8px]">◇</div>
        
        {/* Main breathing icon */}
        <GrimoireIcon 
          className={cn(
            "h-12 w-12 text-muted-foreground animate-breathe",
            ritualActive && "text-cyber-sigil brightness-125"
          )}
        />
      </div>
    </div>
  );
}
