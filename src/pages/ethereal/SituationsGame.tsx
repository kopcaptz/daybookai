import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isEtherealSessionValid, getEtherealSession } from '@/lib/etherealTokenService';
import { EtherealHeader } from '@/components/ethereal/EtherealHeader';
import { GameLobby } from '@/components/games/GameLobby';
import { PickerView } from '@/components/games/PickerView';
import { ResponderView } from '@/components/games/ResponderView';
import { ReflectionView } from '@/components/games/ReflectionView';
import { getCurrentRound, GameSession, GameRound, getLevelLabel } from '@/lib/gameService';
import { supabase } from '@/integrations/supabase/client';

export default function SituationsGame() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<GameSession | null>(null);
  const [round, setRound] = useState<GameRound | null>(null);
  const [myRole, setMyRole] = useState<'picker' | 'responder' | 'spectator'>('spectator');
  const [error, setError] = useState<string | null>(null);

  if (!isEtherealSessionValid()) {
    return <Navigate to="/e/home" replace />;
  }

  const ethSession = getEtherealSession();

  const loadGameState = useCallback(async () => {
    if (!sessionId) return;

    const result = await getCurrentRound(sessionId);
    if (result.success && result.data) {
      setSession(result.data.session);
      setRound(result.data.round);
      setMyRole(result.data.myRole);
      setError(null);
    } else {
      setError(result.error || 'Не удалось загрузить игру');
    }
    setIsLoading(false);
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    loadGameState();
  }, [loadGameState]);

  // Realtime subscription for game updates
  useEffect(() => {
    if (!ethSession?.channelKey) return;

    const channel = supabase.channel(`game:${sessionId}`);

    channel
      .on('broadcast', { event: 'game_update' }, () => {
        console.log('[Game] Received game_update, refreshing...');
        loadGameState();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ethSession?.channelKey, sessionId, loadGameState]);

  // Broadcast helper
  const broadcastUpdate = useCallback(() => {
    if (!ethSession?.channelKey || !sessionId) return;

    const channel = supabase.channel(`game:${sessionId}`);
    channel.send({
      type: 'broadcast',
      event: 'game_update',
      payload: { sessionId, ts: Date.now() },
    });
  }, [ethSession?.channelKey, sessionId]);

  const handleUpdate = useCallback(() => {
    broadcastUpdate();
    loadGameState();
  }, [broadcastUpdate, loadGameState]);

  const handleGameEnd = useCallback(() => {
    navigate('/e/games');
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <EtherealHeader title="Игровой зал" subtitle="Загрузка..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col min-h-screen">
        <EtherealHeader title="Игровой зал" subtitle="Ошибка" />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-destructive mb-4">{error || 'Игра не найдена'}</p>
          <button
            onClick={() => navigate('/e/games')}
            className="text-primary underline"
          >
            Вернуться в лобби
          </button>
        </div>
      </div>
    );
  }

  const levelInfo = getLevelLabel(session.adult_level);

  // Determine current view based on game state
  const renderGameView = () => {
    // Lobby state
    if (session.status === 'lobby') {
      return <GameLobby session={session} onUpdate={handleUpdate} />;
    }

    // Active game
    if (session.status === 'active') {
      // No round yet = picker needs to pick
      if (!round) {
        if (myRole === 'picker') {
          return (
            <div className="p-4">
              <PickerView
                sessionId={session.id}
                adultLevel={session.adult_level}
                roundNumber={session.current_round}
                onPicked={handleUpdate}
              />
            </div>
          );
        } else {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                Партнёр выбирает ситуацию...
              </p>
            </div>
          );
        }
      }

      // Round exists but no responder answer = responder's turn
      if (!round.responder_answer) {
        if (myRole === 'responder') {
          return (
            <div className="p-4">
              <ResponderView
                sessionId={session.id}
                session={session}
                round={round}
                onResponded={handleUpdate}
              />
            </div>
          );
        } else {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                Ожидание ответа партнёра...
              </p>
            </div>
          );
        }
      }

      // Both answered = reflection phase
      // Only picker and responder can see reflection
      if (myRole === 'picker' || myRole === 'responder') {
        return (
          <div className="p-4">
            <ReflectionView
              sessionId={session.id}
              session={session}
              round={round}
              myRole={myRole}
              onNext={handleUpdate}
              onEnd={handleGameEnd}
            />
          </div>
        );
      }

      // Spectator view
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-muted-foreground">Наблюдение за игрой...</p>
        </div>
      );
    }

    // Completed
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground mb-4">Игра завершена</p>
        <button
          onClick={() => navigate('/e/games')}
          className="text-primary underline"
        >
          Вернуться в лобби
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <EtherealHeader
        title="Ситуации на борту"
        subtitle={`Раунд ${session.current_round || 1} ${levelInfo.icon || ''}`}
      />
      <div className="flex-1 overflow-auto">{renderGameView()}</div>
    </div>
  );
}
