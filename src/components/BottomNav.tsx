import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scroll, Calendar, MessageSquare, Settings, Feather } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { getPendingReminderCount } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { useHeroTransition } from '@/hooks/useHeroTransition';

export function BottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const { startTransition } = useHeroTransition();
  const centerButtonRef = useRef<HTMLButtonElement>(null);
  
  // Reactive pending reminders count for badge
  const pendingCount = useLiveQuery(() => getPendingReminderCount(), [], 0);

  const navItems = [
    { path: '/', icon: Scroll, label: t('nav.today'), showBadge: true },
    { path: '/calendar', icon: Calendar, label: t('nav.calendar') },
    { path: '/new', icon: Feather, label: '', isCenter: true },
    { path: '/discussions', icon: MessageSquare, label: t('nav.discussions') },
    { path: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/90 backdrop-blur-xl safe-bottom">
      {/* Luminous top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />

      {/* Rune separator */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 text-cyber-sigil/40">
        <span className="text-xs">◇</span>
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-cyber-glow/40 to-transparent" />
        <span className="text-xs">◇</span>
      </div>

      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.isCenter) {
            const handleCenterClick = (e: React.MouseEvent) => {
              e.preventDefault();
              
              // Haptic feedback
              if (navigator.vibrate) {
                navigator.vibrate(15);
              }
              
              // On discussions page — create new discussion directly
              if (location.pathname === '/discussions') {
                window.dispatchEvent(new CustomEvent('create-new-discussion'));
                return;
              }
              
              // On other pages — navigate to /new
              window.dispatchEvent(new CustomEvent('grimoire-ritual-start'));
              startTransition(centerButtonRef.current, item.path);
            };
            
            return (
              <button
                key={item.path}
                ref={centerButtonRef}
                onClick={handleCenterClick}
                className="flex -translate-y-3 items-center justify-center"
              >
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-lg transition-all duration-300 active:scale-110",
                  "bg-gradient-to-br from-primary via-primary to-accent",
                  "border border-cyber-glow/30",
                  "relative overflow-hidden grimoire-shadow"
                )}>
                  {/* Glow accent */}
                  <div className="absolute top-1 start-1 w-4 h-4 rounded-full bg-cyber-glow/20 blur-sm" />
                  
                  {/* Pulsing ring indicator for tappability */}
                  <div className="absolute inset-0 rounded-lg border-2 border-cyber-glow/20 animate-ping-slow" />
                  
                  <Icon className="h-6 w-6 text-primary-foreground relative z-10" />
                </div>
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 transition-all duration-200',
                isActive 
                  ? 'text-cyber-sigil' 
                  : 'text-muted-foreground hover:text-foreground/90'
              )}
            >
              <div className="relative">
                <Icon 
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive && "drop-shadow-[0_0_8px_hsl(var(--sigil)/0.6)]"
                  )} 
                  strokeWidth={1.5}
                />
                {/* Pending reminders badge */}
                {item.showBadge && pendingCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -end-3 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center"
                  >
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </Badge>
                )}
                {isActive && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-gradient-to-r from-cyber-sigil/60 via-cyber-sigil to-cyber-sigil/60" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium tracking-wide transition-colors",
                isActive ? "text-cyber-sigil" : "text-muted-foreground/80"
              )}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
