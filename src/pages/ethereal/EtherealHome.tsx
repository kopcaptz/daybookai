import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { CabinCard } from '@/components/ethereal/CabinCard';
import { useEtherealRealtime } from '@/hooks/useEtherealRealtime';
import { Circle, Wine, BookOpen, Anchor, Map, Gamepad2 } from 'lucide-react';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  mainSalon: { ru: 'Главный салон', en: 'Main Salon' },
  welcomePrefix: { ru: 'Добро пожаловать на борт, ', en: 'Welcome aboard, ' },
  chooseRoom: { ru: 'Яхта ожидает ваших решений. Выберите каюту для посещения.', en: 'The yacht awaits your decisions. Choose a cabin to visit.' },
  bar: { ru: 'Бар', en: 'Bar' },
  chat: { ru: 'Чат', en: 'Chat' },
  library: { ru: 'Библиотека', en: 'Library' },
  chronicles: { ru: 'Хроники', en: 'Chronicles' },
  bridge: { ru: 'Мостик', en: 'Bridge' },
  tasks: { ru: 'Задачи', en: 'Tasks' },
  map: { ru: 'Карта', en: 'Map' },
  calendar: { ru: 'Календарь', en: 'Calendar' },
  gameRoom: { ru: 'Игровой зал', en: 'Game Room' },
  games: { ru: 'Игры', en: 'Games' },
  guestsAboard: { ru: 'Гости на борту', en: 'Guests aboard' },
} as const;

export default function EtherealHome() {
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const session = getEtherealSession();
  const { onlineMembers } = useEtherealRealtime();

  return (
    <div className="flex flex-col min-h-screen yacht-gradient">
      <EtherealHeader title="S/Y Aurora" subtitle={t('mainSalon')} />
      
      <div className="flex-1 p-4 space-y-6">
        {/* Welcome card */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="font-serif text-xl mb-2">
            {t('welcomePrefix')}<span className="text-primary">{session?.displayName}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('chooseRoom')}
          </p>
        </div>

        {/* Cabin grid */}
        <div className="grid grid-cols-2 gap-3">
          <CabinCard
            to="/e/chat"
            icon={Wine}
            title={t('bar')}
            subtitle={t('chat')}
          />
          <CabinCard
            to="/e/chronicles"
            icon={BookOpen}
            title={t('library')}
            subtitle={t('chronicles')}
          />
          <CabinCard
            to="/e/tasks"
            icon={Anchor}
            title={t('bridge')}
            subtitle={t('tasks')}
          />
          <CabinCard
            to="/e/calendar"
            icon={Map}
            title={t('map')}
            subtitle={t('calendar')}
          />
          <CabinCard
            to="/e/games"
            icon={Gamepad2}
            title={t('gameRoom')}
            subtitle={t('games')}
          />
        </div>

        {/* Online members */}
        {onlineMembers.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Circle className="h-2 w-2 fill-green-500 text-green-500" />
              {t('guestsAboard')}: {onlineMembers.length}
            </h3>
            <div className="flex flex-wrap gap-2">
              {onlineMembers.map((member) => (
                <div
                  key={member.memberId}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm"
                >
                  {member.displayName}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
