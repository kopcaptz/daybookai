import { useState } from 'react';
import { Loader2, Shuffle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SituationCard, OptionButton } from './SituationCard';
import { SafetyControls } from './SafetyControls';
import {
  Situation,
  Category,
  getAvailableCategories,
  generateSituations,
  pickSituation,
} from '@/lib/gameService';

interface PickerViewProps {
  sessionId: string;
  adultLevel: number;
  roundNumber: number;
  onPicked: () => void;
}

type Step = 'category' | 'generating' | 'select' | 'answer' | 'submitting';

export function PickerView({
  sessionId,
  adultLevel,
  roundNumber,
  onPicked,
}: PickerViewProps) {
  const [step, setStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [selectedSituation, setSelectedSituation] = useState<Situation | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categories = getAvailableCategories(adultLevel);
  const isOpenCard = selectedSituation?.cardType === 'open';

  const handleCategorySelect = async (category: Category) => {
    setSelectedCategory(category);
    setStep('generating');
    setError(null);

    const result = await generateSituations(sessionId, category.id);
    if (result.success && result.data?.situations) {
      setSituations(result.data.situations);
      setStep('select');
    } else {
      setError(result.error || 'Не удалось сгенерировать ситуации');
      setStep('category');
    }
  };

  const handleSituationSelect = (situation: Situation) => {
    setSelectedSituation(situation);
    setMyAnswer(null);
    setOpenAnswer('');
    setStep('answer');
  };

  const handleAnswerSelect = (answerId: string) => {
    setMyAnswer(answerId);
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedSituation) return;
    
    const finalAnswer = isOpenCard ? openAnswer : myAnswer;
    if (!finalAnswer) return;

    setStep('submitting');
    setError(null);

    const result = await pickSituation(
      sessionId,
      selectedCategory.id,
      selectedSituation,
      finalAnswer
    );

    if (result.success) {
      onPicked();
    } else {
      setError(result.error || 'Не удалось отправить выбор');
      setStep('answer');
    }
  };

  const handleSafetyUpdate = () => {
    // Refresh state after safety action
    onPicked();
  };

  // Category selection
  if (step === 'category') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold">Раунд {roundNumber}</h2>
          <p className="text-sm text-muted-foreground">Выберите категорию</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat)}
              className="p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-all text-left"
            >
              <span className="font-medium">{cat.label}</span>
              {cat.minLevel > 0 && (
                <span className="ml-2 text-xs text-destructive">
                  {'🔥'.repeat(cat.minLevel)}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Generating situations
  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Генерируем ситуации...</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Категория: {selectedCategory?.label}
        </p>
      </div>
    );
  }

  // Selecting a situation
  if (step === 'select') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold">Выберите ситуацию</h2>
          <p className="text-sm text-muted-foreground">
            {selectedCategory?.label}
          </p>
        </div>

        <div className="space-y-3">
          {situations.map((sit, idx) => (
            <button
              key={sit.id}
              onClick={() => handleSituationSelect(sit)}
              className="w-full text-left p-4 rounded-lg bg-[#f5f0e8] text-[#1a1612] border border-primary/20 hover:border-primary/50 transition-all"
            >
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium shrink-0">
                  {idx + 1}
                </span>
                <div>
                  <p className="text-sm leading-relaxed">{sit.text}</p>
                  {sit.cardType === 'open' && (
                    <span className="text-xs text-muted-foreground mt-1 inline-block">
                      Открытый вопрос
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          onClick={() => setStep('category')}
          className="w-full text-muted-foreground"
        >
          <Shuffle className="w-4 h-4 mr-2" />
          Другая категория
        </Button>
      </div>
    );
  }

  // Answering (picker's secret answer)
  if (step === 'answer' || step === 'submitting') {
    return (
      <div className="space-y-4">
        <SafetyControls
          sessionId={sessionId}
          currentLevel={adultLevel}
          onUpdate={handleSafetyUpdate}
        />

        <SituationCard
          title="Ваш выбор"
          subtitle="Ваш ответ останется скрытым до конца раунда"
          variant="paper"
        >
          <p className="text-sm leading-relaxed mb-4">
            {selectedSituation?.text}
          </p>

          {isOpenCard ? (
            <Textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              placeholder="Опишите ваш ответ..."
              className="bg-[#faf7f2] border-[#d4c9b8] text-[#1a1612] placeholder:text-[#1a1612]/50"
              rows={4}
              disabled={step === 'submitting'}
            />
          ) : (
            <div className="space-y-2">
              {selectedSituation?.options.map((opt) => (
                <OptionButton
                  key={opt.id}
                  id={opt.id}
                  text={opt.text}
                  selected={myAnswer === opt.id}
                  disabled={step === 'submitting'}
                  onSelect={handleAnswerSelect}
                  variant="paper"
                />
              ))}
            </div>
          )}
        </SituationCard>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => setStep('select')}
            disabled={step === 'submitting'}
            className="flex-1"
          >
            ← Назад
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              step === 'submitting' ||
              (isOpenCard ? !openAnswer.trim() : !myAnswer)
            }
            className="flex-1"
          >
            {step === 'submitting' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-2" />
            )}
            Отправить партнёру
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
