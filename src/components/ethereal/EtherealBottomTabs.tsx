import { NavLink, useLocation } from 'react-router-dom';
import { Wine, BookOpen, Anchor, Map, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  bar: { ru: 'Бар', en: 'Bar' },
  library: { ru: 'Библиотека', en: 'Library' },
  bridge: { ru: 'Мостик', en: 'Bridge' },
  map: { ru: 'Карта', en: 'Map' },
  games: { ru: 'Игры', en: 'Games' },
} as const;

export function EtherealBottomTabs() {
  const location = useLocation();
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  const tabs = [
    { path: '/e/chat', icon: Wine, label: t('bar') },
    { path: '/e/chronicles', icon: BookOpen, label: t('library') },
    { path: '/e/tasks', icon: Anchor, label: t('bridge') },
    { path: '/e/calendar', icon: Map, label: t('map') },
    { path: '/e/games', icon: Gamepad2, label: t('games') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex rtl:flex-row-reverse justify-around items-center h-16 max-w-lg mx-auto">
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
