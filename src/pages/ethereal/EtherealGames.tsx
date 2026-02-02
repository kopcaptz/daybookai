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

export default function EtherealGames() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      setError(result.error || 'Не удалось создать игру');
    }
    setIsCreating(false);
  };

  const handleJoinSession = (sessionId: string) => {
    navigate(`/e/games/situations/${sessionId}`);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <EtherealHeader title="Игровой зал" subtitle="Игры" />

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
            Новая игра
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
              Активные игры
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
                    <p className="font-medium">Ситуации на борту</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-3 h-3" />
                      <span>
                        {s.picker?.display_name || 'Организатор'}
                        {s.responder?.display_name
                          ? ` и ${s.responder.display_name}`
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
                    {s.status === 'lobby' ? 'Ожидание' : `Раунд ${s.current_round}`}
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
                Пока нет активных игр. Создайте новую игру, чтобы начать!
              </p>
            </div>
          )
        )}

        {/* Available games section */}
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Доступные игры
          </h3>
          <div className="p-4 rounded-lg bg-card border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Wine className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Ситуации на борту</p>
                <p className="text-xs text-muted-foreground">
                  Игра для пар · Узнайте друг друга лучше
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
