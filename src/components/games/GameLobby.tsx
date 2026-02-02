import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Play, Loader2, Shield, ShieldAlert, Wine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SituationCard } from './SituationCard';
import { GameSession, startGame, joinGameSession } from '@/lib/gameService';
import { getEtherealSession } from '@/lib/etherealTokenService';

interface GameLobbyProps {
  session: GameSession;
  onUpdate: () => void;
}

export function GameLobby({ session, onUpdate }: GameLobbyProps) {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ethSession = getEtherealSession();
  const myId = ethSession?.memberId;
  const isPicker = session.picker_id === myId;
  const isResponder = session.responder_id === myId;
  const canJoin = !isPicker && !isResponder;
  const canStart = isPicker && session.responder_id !== null;

  const handleJoin = async () => {
    setIsJoining(true);
    setError(null);

    const result = await joinGameSession(session.id);
    if (result.success) {
      onUpdate();
    } else {
      setError(result.error || 'Не удалось присоединиться');
    }
    setIsJoining(false);
  };

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);

    const result = await startGame(session.id);
    if (result.success) {
      onUpdate();
    } else {
      setError(result.error || 'Не удалось начать игру');
    }
    setIsStarting(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <SituationCard
        title="Ожидание игроков"
        subtitle="Ситуации на борту"
        icon={Wine}
        variant="brass"
      >
        <div className="space-y-4 mt-2">
          {/* Players */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Участники:</span>
            </div>

            <div className="space-y-2 pl-6">
              {/* Picker */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm">
                  {session.picker?.display_name || 'Организатор'}
                </span>
                {isPicker && (
                  <span className="text-xs text-muted-foreground">(вы)</span>
                )}
              </div>

              {/* Responder */}
              {session.responder_id ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm">
                    {session.responder?.display_name || 'Партнёр'}
                  </span>
                  {isResponder && (
                    <span className="text-xs text-muted-foreground">(вы)</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                  <span className="text-sm text-muted-foreground italic">
                    Ожидание партнёра...
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Adult mode indicator */}
          <div className="flex items-center gap-2 text-sm">
            {session.adult_mode ? (
              <>
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <span className="text-muted-foreground">Режим 18+</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Безопасный режим</span>
              </>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {canJoin && (
              <Button
                onClick={handleJoin}
                disabled={isJoining}
                className="flex-1"
              >
                {isJoining ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Users className="w-4 h-4 mr-2" />
                )}
                Присоединиться
              </Button>
            )}

            {isPicker && (
              <Button
                onClick={handleStart}
                disabled={!canStart || isStarting}
                className="flex-1"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Начать игру
              </Button>
            )}

            {isResponder && !canStart && (
              <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                Ожидание начала игры...
              </div>
            )}
          </div>
        </div>
      </SituationCard>

      <Button
        variant="ghost"
        onClick={() => navigate('/e/games')}
        className="text-muted-foreground"
      >
        ← Вернуться в лобби
      </Button>
    </div>
  );
}

interface CreateGameFormProps {
  onCreate: (adultMode: boolean) => void;
  isCreating: boolean;
}

export function CreateGameForm({ onCreate, isCreating }: CreateGameFormProps) {
  const [adultMode, setAdultMode] = useState(false);

  return (
    <SituationCard
      title="Новая игра"
      subtitle="Ситуации на борту"
      icon={Wine}
      variant="brass"
    >
      <div className="space-y-4 mt-2">
        <p className="text-sm text-muted-foreground">
          Интерактивная игра для пар. Выбирайте жизненные ситуации, отвечайте
          на вопросы и узнавайте друг друга лучше.
        </p>

        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Режим 18+</span>
          </div>
          <Switch checked={adultMode} onCheckedChange={setAdultMode} />
        </div>

        {adultMode && (
          <p className="text-xs text-muted-foreground bg-destructive/10 p-2 rounded">
            В режиме 18+ доступны категории на интимные темы. Убедитесь, что оба
            партнёра готовы.
          </p>
        )}

        <Button
          onClick={() => onCreate(adultMode)}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Создать игру
        </Button>
      </div>
    </SituationCard>
  );
}
