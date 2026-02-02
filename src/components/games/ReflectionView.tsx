import { useState } from 'react';
import {
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SituationCard } from './SituationCard';
import { AftercareRating } from './AftercareRating';
import {
  GameRound,
  GameSession,
  revealPickerAnswer,
  requestReflection,
  nextRound,
  endGame,
} from '@/lib/gameService';

interface ReflectionViewProps {
  sessionId: string;
  session: GameSession;
  round: GameRound;
  myRole: 'picker' | 'responder';
  onNext: () => void;
  onEnd: () => void;
}

export function ReflectionView({
  sessionId,
  session,
  round,
  myRole,
  onNext,
  onEnd,
}: ReflectionViewProps) {
  const [isRevealing, setIsRevealing] = useState(false);
  const [isRequestingAI, setIsRequestingAI] = useState(false);
  const [reflection, setReflection] = useState(round.ai_reflection || '');
  const [isEnding, setIsEnding] = useState(false);
  const [isNexting, setIsNexting] = useState(false);
  const [showAftercare, setShowAftercare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicker = myRole === 'picker';
  const isRevealed = round.picker_revealed;
  const isOpenCard = round.card_type === 'open';

  // Find answer texts
  const pickerOption = round.options.find((o) => o.id === round.picker_answer);
  const responderOption = round.options.find(
    (o) => o.id === round.responder_answer
  );
  const isMatch = !isOpenCard && round.picker_answer === round.responder_answer;

  const handleReveal = async () => {
    setIsRevealing(true);
    setError(null);

    const result = await revealPickerAnswer(sessionId);
    if (!result.success) {
      setError(result.error || 'Не удалось раскрыть ответ');
    }
    setIsRevealing(false);
  };

  const handleRequestAI = async () => {
    setIsRequestingAI(true);
    setError(null);

    const result = await requestReflection(sessionId);
    if (result.success && result.data?.reflection) {
      setReflection(result.data.reflection);
    } else {
      setError(result.error || 'Не удалось получить анализ');
    }
    setIsRequestingAI(false);
  };

  const handleNext = async () => {
    // Show aftercare for adult levels
    if (session.adult_level > 0 && !showAftercare) {
      setShowAftercare(true);
      return;
    }

    setIsNexting(true);
    const result = await nextRound(sessionId);
    if (result.success) {
      onNext();
    }
    setIsNexting(false);
  };

  const handleAftercareComplete = () => {
    setShowAftercare(false);
    handleNextRound();
  };

  const handleNextRound = async () => {
    setIsNexting(true);
    const result = await nextRound(sessionId);
    if (result.success) {
      onNext();
    }
    setIsNexting(false);
  };

  const handleEnd = async () => {
    setIsEnding(true);
    const result = await endGame(sessionId);
    if (result.success) {
      onEnd();
    }
    setIsEnding(false);
  };

  // Show aftercare rating
  if (showAftercare && isRevealed) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Как ощущения?</h2>
          <p className="text-sm text-muted-foreground">
            Раунд {round.round_number} завершён
          </p>
        </div>

        <AftercareRating
          sessionId={sessionId}
          currentLevel={session.adult_level}
          onRated={handleAftercareComplete}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold">Результаты раунда</h2>
        <p className="text-sm text-muted-foreground">
          Раунд {round.round_number}
        </p>
      </div>

      {/* Situation reminder */}
      <SituationCard title="Ситуация" variant="paper">
        <p className="text-sm leading-relaxed">{round.situation_text}</p>
      </SituationCard>

      {/* Responder's answer (always visible) */}
      <SituationCard title="Ответ партнёра" variant="default">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
            {isOpenCard || round.responder_answer === 'custom' || round.responder_answer === 'open'
              ? '✎'
              : round.responder_answer}
          </span>
          <p className="text-sm">
            {round.responder_custom || responderOption?.text || 'Свой вариант'}
          </p>
        </div>
      </SituationCard>

      {/* Picker's answer (hidden until revealed) */}
      {isRevealed ? (
        <SituationCard
          title="Ваш выбор"
          subtitle={isPicker ? 'Вы выбрали' : 'Партнёр выбрал'}
          variant="brass"
        >
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
              {isOpenCard ? '✎' : round.picker_answer}
            </span>
            <p className="text-sm">
              {isOpenCard ? round.picker_answer : pickerOption?.text}
            </p>
          </div>

          {/* Match indicator - only for ABC cards */}
          {!isOpenCard && (
            <div className="mt-4 flex items-center gap-2">
              {isMatch ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600">
                    Ваши ответы совпали!
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-amber-500" />
                  <span className="text-sm text-amber-600">
                    Разные подходы — это нормально
                  </span>
                </>
              )}
            </div>
          )}
        </SituationCard>
      ) : (
        <SituationCard title="Ответ скрыт" variant="default">
          <div className="flex items-center gap-3 text-muted-foreground">
            <EyeOff className="w-5 h-5" />
            <p className="text-sm">
              {isPicker
                ? 'Раскройте свой ответ, чтобы сравнить'
                : 'Ожидание раскрытия ответа...'}
            </p>
          </div>

          {isPicker && (
            <Button
              onClick={handleReveal}
              disabled={isRevealing}
              className="w-full mt-3"
            >
              {isRevealing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Раскрыть мой ответ
            </Button>
          )}
        </SituationCard>
      )}

      {/* AI Reflection */}
      {isRevealed && (
        <>
          {reflection ? (
            <SituationCard
              title="Мысли ведущего"
              icon={Sparkles}
              variant="default"
            >
              <p className="text-sm text-muted-foreground italic leading-relaxed">
                {reflection}
              </p>
            </SituationCard>
          ) : (
            <Button
              variant="outline"
              onClick={handleRequestAI}
              disabled={isRequestingAI}
              className="w-full"
            >
              {isRequestingAI ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Получить анализ от ИИ
            </Button>
          )}
        </>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
          {error}
        </div>
      )}

      {/* Actions */}
      {isRevealed && (
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleEnd}
            disabled={isEnding || isNexting}
            className="flex-1"
          >
            {isEnding && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Завершить
          </Button>
          <Button
            onClick={handleNext}
            disabled={isEnding || isNexting}
            className="flex-1"
          >
            {isNexting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Следующий раунд
          </Button>
        </div>
      )}
    </div>
  );
}
