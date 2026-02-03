import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isEtherealSessionValid } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { Gamepad2, Wine, Loader2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateGameForm } from '@/components/games/GameLobby';
import {
  listGameSessions,
  createGameSession,
  GameSession,
} from '@/lib/gameService';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  gameRoom: { ru: 'Игровой зал', en: 'Game Room' },
  games: { ru: 'Игры', en: 'Games' },
  newGame: { ru: 'Новая игра', en: 'New game' },
  createFailed: { ru: 'Не удалось создать игру', en: 'Failed to create game' },
  activeGames: { ru: 'Активные игры', en: 'Active games' },
  situationsOnBoard: { ru: 'Ситуации на борту', en: 'Situations on Board' },
  waiting: { ru: 'Ожидание', en: 'Waiting' },
  round: { ru: 'Раунд', en: 'Round' },
  noActiveGames: { ru: 'Пока нет активных игр. Создайте новую игру, чтобы начать!', en: 'No active games yet. Create a new game to start!' },
  availableGames: { ru: 'Доступные игры', en: 'Available games' },
  forCouples: { ru: 'Игра для пар · Узнайте друг друга лучше', en: 'Game for couples · Get to know each other better' },
  organizer: { ru: 'Организатор', en: 'Organizer' },
  and: { ru: 'и', en: 'and' },
} as const;

export default function EtherealGames() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const loadSessions = async () => {
    setIsLoading(true);
    const result = await listGameSessions();
    if (result.success && result.data?.sessions) {
      setSessions(result.data.sessions);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleCreate = async (adultLevel: number) => {
    setIsCreating(true);
    setError(null);

    const result = await createGameSession(adultLevel);
    if (result.success && result.data?.session) {
      navigate(`/e/games/situations/${result.data.session.id}`);
    } else {
      setError(result.error || t('createFailed'));
    }
    setIsCreating(false);
  };

  const handleJoinSession = (sessionId: string) => {
    navigate(`/e/games/situations/${sessionId}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <EtherealHeader title={t('gameRoom')} subtitle={t('games')} />

      <div className="flex-1 p-4 space-y-4">
        {/* Create new game */}
        {showCreateForm ? (
          <CreateGameForm onCreate={handleCreate} isCreating={isCreating} />
        ) : (
          <Button
            onClick={() => setShowCreateForm(true)}
            className="w-full"
            size="lg"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('newGame')}
          </Button>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
            {error}
          </div>
        )}

        {/* Active sessions */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('activeGames')}
            </h3>
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleJoinSession(s.id)}
                className="w-full p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wine className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{t('situationsOnBoard')}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-3 h-3" />
                      <span>
                        {s.picker?.display_name || t('organizer')}
                        {s.responder?.display_name
                          ? ` ${t('and')} ${s.responder.display_name}`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`px-2 py-1 rounded text-xs ${
                      s.status === 'lobby'
                        ? 'bg-amber-500/20 text-amber-600'
                        : 'bg-green-500/20 text-green-600'
                    }`}
                  >
                    {s.status === 'lobby' ? t('waiting') : `${t('round')} ${s.current_round}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          !showCreateForm && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Gamepad2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm max-w-sm">
                {t('noActiveGames')}
              </p>
            </div>
          )
        )}

        {/* Available games section */}
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t('availableGames')}
          </h3>
          <div className="p-4 rounded-lg bg-card border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Wine className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{t('situationsOnBoard')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('forCouples')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
