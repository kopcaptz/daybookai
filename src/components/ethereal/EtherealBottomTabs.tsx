import { NavLink, useLocation } from 'react-router-dom';
import { Wine, BookOpen, Anchor, Map, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/e/chat', icon: Wine, label: 'Бар', sublabel: 'Чат' },
  { path: '/e/chronicles', icon: BookOpen, label: 'Библиотека', sublabel: 'Хроники' },
  { path: '/e/tasks', icon: Anchor, label: 'Мостик', sublabel: 'Задачи' },
  { path: '/e/calendar', icon: Map, label: 'Карта', sublabel: 'Календарь' },
  { path: '/e/games', icon: Gamepad2, label: 'Игры', sublabel: '' },
];

export function EtherealBottomTabs() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full transition-colors relative',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {/* Active indicator - brass top border */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
              <Icon className="h-5 w-5" />
              <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
