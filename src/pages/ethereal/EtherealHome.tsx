import { Navigate } from 'react-router-dom';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { CabinCard } from '@/components/ethereal/CabinCard';
import { useEtherealRealtime } from '@/hooks/useEtherealRealtime';
import { Circle, Wine, BookOpen, Anchor, Map, Gamepad2 } from 'lucide-react';

export default function EtherealHome() {
  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const session = getEtherealSession();
  const { onlineMembers } = useEtherealRealtime();

  return (
    <div className="flex flex-col min-h-screen yacht-gradient">
      <EtherealHeader title="S/Y Aurora" subtitle="Главный салон" />
      
      <div className="flex-1 p-4 space-y-6">
        {/* Welcome card */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="font-serif text-xl mb-2">
            Добро пожаловать на борт, <span className="text-primary">{session?.displayName}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Яхта ожидает ваших решений. Выберите каюту для посещения.
          </p>
        </div>

        {/* Cabin grid */}
        <div className="grid grid-cols-2 gap-3">
          <CabinCard
            to="/e/chat"
            icon={Wine}
            title="Бар"
            subtitle="Чат"
          />
          <CabinCard
            to="/e/chronicles"
            icon={BookOpen}
            title="Библиотека"
            subtitle="Хроники"
          />
          <CabinCard
            to="/e/tasks"
            icon={Anchor}
            title="Мостик"
            subtitle="Задачи"
          />
          <CabinCard
            to="/e/calendar"
            icon={Map}
            title="Карта"
            subtitle="Календарь"
          />
          <CabinCard
            to="/e/games"
            icon={Gamepad2}
            title="Игровой зал"
            subtitle="Игры"
          />
        </div>

        {/* Online members */}
        {onlineMembers.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Circle className="h-2 w-2 fill-green-500 text-green-500" />
              Гости на борту: {onlineMembers.length}
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
