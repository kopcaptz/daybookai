import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Play, Loader2, ShieldCheck, Wine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SituationCard } from './SituationCard';
import { AdultLevelSelector } from './AdultLevelSelector';
import { ConsentModal } from './ConsentModal';
import { GameSession, startGame, joinGameSession, getLevelLabel } from '@/lib/gameService';
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
  const [showConsentModal, setShowConsentModal] = useState(false);

  const ethSession = getEtherealSession();
  const myId = ethSession?.memberId;
  const isPicker = session.picker_id === myId;
  const isResponder = session.responder_id === myId;
  const canJoin = !isPicker && !isResponder;
  const canStart = isPicker && session.responder_id !== null;
  
  const levelInfo = getLevelLabel(session.adult_level);
  const needsConsent = session.adult_level > 0 && 
    !(session.consent_picker && session.consent_responder);
  const myRole = isPicker ? 'picker' : 'responder';

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
    // Check if consent is needed
    if (needsConsent) {
      setShowConsentModal(true);
      return;
    }

    setIsStarting(true);
    setError(null);

    const result = await startGame(session.id);
    if (result.success) {
      onUpdate();
    } else if (result.needsConsent) {
      setShowConsentModal(true);
    } else {
      setError(result.error || 'Не удалось начать игру');
    }
    setIsStarting(false);
  };

  const handleConsentGiven = () => {
    setShowConsentModal(false);
    onUpdate();
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

          {/* Adult level indicator */}
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {levelInfo.name} {levelInfo.icon || ''}
            </span>
            {needsConsent && (
              <span className="text-xs text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded">
                Требуется согласие
              </span>
            )}
          </div>

          {/* Consent status for adult levels */}
          {session.adult_level > 0 && (
            <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <span className={session.consent_picker ? 'text-green-600' : ''}>
                  {session.consent_picker ? '✓' : '○'} Организатор
                </span>
                <span className={session.consent_responder ? 'text-green-600' : ''}>
                  {session.consent_responder ? '✓' : '○'} Партнёр
                </span>
              </div>
            </div>
          )}

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
                {needsConsent ? 'Подтвердить и начать' : 'Начать игру'}
              </Button>
            )}

            {isResponder && session.adult_level > 0 && !session.consent_responder && (
              <Button
                onClick={() => setShowConsentModal(true)}
                className="flex-1"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Подтвердить уровень
              </Button>
            )}

            {isResponder && (!needsConsent || session.consent_responder) && !canStart && (
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

      {/* Consent Modal */}
      {showConsentModal && (isPicker || isResponder) && (
        <ConsentModal
          open={showConsentModal}
          session={session}
          myRole={myRole}
          onConsentGiven={handleConsentGiven}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </div>
  );
}

interface CreateGameFormProps {
  onCreate: (adultLevel: number) => void;
  isCreating: boolean;
}

export function CreateGameForm({ onCreate, isCreating }: CreateGameFormProps) {
  const [adultLevel, setAdultLevel] = useState(0);

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

        <AdultLevelSelector
          value={adultLevel}
          onChange={setAdultLevel}
          disabled={isCreating}
        />

        <Button
          onClick={() => onCreate(adultLevel)}
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
