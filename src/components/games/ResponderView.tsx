import { useState } from 'react';
import { Loader2, Send, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SituationCard, OptionButton } from './SituationCard';
import { SafetyControls } from './SafetyControls';
import { GameRound, GameSession, respondToSituation } from '@/lib/gameService';

interface ResponderViewProps {
  sessionId: string;
  session: GameSession;
  round: GameRound;
  onResponded: () => void;
}

export function ResponderView({
  sessionId,
  session,
  round,
  onResponded,
}: ResponderViewProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [openAnswer, setOpenAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpenCard = round.card_type === 'open';

  const handleSubmit = async () => {
    let finalAnswer: string;
    let customValue: string | undefined;

    if (isOpenCard) {
      finalAnswer = 'open';
      customValue = openAnswer;
    } else if (showCustom) {
      finalAnswer = 'custom';
      customValue = customAnswer;
    } else {
      finalAnswer = selectedAnswer || '';
    }

    if (!finalAnswer) return;

    setIsSubmitting(true);
    setError(null);

    const result = await respondToSituation(sessionId, finalAnswer, customValue);

    if (result.success) {
      onResponded();
    } else {
      setError(result.error || 'Не удалось отправить ответ');
    }
    setIsSubmitting(false);
  };

  const handleSafetyUpdate = () => {
    onResponded();
  };

  const categoryLabels: Record<string, string> = {
    budget: 'Финансы',
    boundaries: 'Личные границы',
    lifestyle: 'Быт',
    social: 'Друзья и семья',
    travel: 'Путешествия',
    romance: 'Романтика',
    intimacy: 'Близость',
    fantasies: 'Желания',
  };

  const canSubmit = isOpenCard
    ? openAnswer.trim().length > 0
    : showCustom
    ? customAnswer.trim().length > 0
    : selectedAnswer !== null;

  return (
    <div className="space-y-4">
      <SafetyControls
        sessionId={sessionId}
        currentLevel={session.adult_level}
        onUpdate={handleSafetyUpdate}
      />

      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold">Раунд {round.round_number}</h2>
        <p className="text-sm text-muted-foreground">
          {categoryLabels[round.category] || round.category}
        </p>
      </div>

      <SituationCard
        title="Ситуация от партнёра"
        subtitle="Как бы вы поступили?"
        variant="paper"
      >
        <p className="text-sm leading-relaxed mb-4">{round.situation_text}</p>

        {isOpenCard ? (
          <Textarea
            value={openAnswer}
            onChange={(e) => setOpenAnswer(e.target.value)}
            placeholder="Опишите, как бы вы поступили..."
            className="bg-[#faf7f2] border-[#d4c9b8] text-[#1a1612] placeholder:text-[#1a1612]/50"
            rows={4}
            disabled={isSubmitting}
          />
        ) : (
          <>
            <div className="space-y-2">
              {round.options.map((opt) => (
                <OptionButton
                  key={opt.id}
                  id={opt.id}
                  text={opt.text}
                  selected={!showCustom && selectedAnswer === opt.id}
                  disabled={isSubmitting}
                  onSelect={(id) => {
                    setSelectedAnswer(id);
                    setShowCustom(false);
                  }}
                  variant="paper"
                />
              ))}

              {/* Custom answer option */}
              <button
                onClick={() => setShowCustom(true)}
                disabled={isSubmitting}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3
                  ${
                    showCustom
                      ? 'bg-primary/20 border-primary'
                      : 'bg-[#faf7f2] border-[#d4c9b8] hover:bg-[#f0ebe0]'
                  }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    showCustom
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-[#d4c9b8] text-[#1a1612]'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                </span>
                <span className="text-sm text-[#1a1612]">Свой вариант</span>
              </button>
            </div>

            {showCustom && (
              <Textarea
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                placeholder="Опишите, как бы вы поступили..."
                className="mt-3 bg-[#faf7f2] border-[#d4c9b8] text-[#1a1612] placeholder:text-[#1a1612]/50"
                rows={3}
              />
            )}
          </>
        )}
      </SituationCard>

      {/* Values question */}
      {round.values_questions?.length > 0 && round.values_questions[0]?.q && (
        <SituationCard title="Подумайте" variant="default">
          <p className="text-sm text-muted-foreground italic">
            {round.values_questions[0].q}
          </p>
        </SituationCard>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
          {error}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !canSubmit}
        className="w-full"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Send className="w-4 h-4 mr-2" />
        )}
        Отправить ответ
      </Button>
    </div>
  );
}
