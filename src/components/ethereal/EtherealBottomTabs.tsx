import { NavLink, useLocation } from 'react-router-dom';
import { MessageCircle, BookOpen, CheckSquare, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/e/chat', icon: MessageCircle, label: 'Chat' },
  { path: '/e/chronicles', icon: BookOpen, label: 'Chronicles' },
  { path: '/e/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/e/calendar', icon: Calendar, label: 'Calendar' },
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
                'flex flex-col items-center justify-center flex-1 h-full transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs mt-1">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
