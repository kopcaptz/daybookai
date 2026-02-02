import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setLevel } from '@/lib/gameService';

interface AftercareRatingProps {
  sessionId: string;
  currentLevel: number;
  onRated: () => void;
}

type Rating = 'comfortable' | 'careful' | 'stop';

export function AftercareRating({
  sessionId,
  currentLevel,
  onRated,
}: AftercareRatingProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDownshift, setShowDownshift] = useState(false);

  const handleRating = async (r: Rating) => {
    setRating(r);

    if (r === 'comfortable') {
      // Just proceed
      onRated();
    } else if (r === 'careful') {
      // Show option to downshift
      setShowDownshift(true);
    } else if (r === 'stop') {
      // Auto-downshift and proceed
      setIsProcessing(true);
      const newLevel = Math.max(0, currentLevel - 1);
      await setLevel(sessionId, newLevel);
      setIsProcessing(false);
      onRated();
    }
  };

  const handleDownshift = async () => {
    setIsProcessing(true);
    const newLevel = Math.max(0, currentLevel - 1);
    await setLevel(sessionId, newLevel);
    setIsProcessing(false);
    onRated();
  };

  const handleSkipDownshift = () => {
    onRated();
  };

  if (rating === 'careful' && showDownshift) {
    return (
      <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
        <p className="text-sm text-center mb-3">
          Хотите снизить уровень игры?
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSkipDownshift}
            disabled={isProcessing}
            className="flex-1"
          >
            Продолжить так
          </Button>
          <Button
            size="sm"
            onClick={handleDownshift}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Снизить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-secondary/50 rounded-lg">
      <p className="text-sm text-center text-muted-foreground mb-3">
        Как вам этот раунд?
      </p>
      <div className="flex gap-2 justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRating('comfortable')}
          disabled={isProcessing}
          className="text-lg px-4"
          title="Комфортно"
        >
          😊
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRating('careful')}
          disabled={isProcessing}
          className="text-lg px-4"
          title="Осторожнее"
        >
          😐
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRating('stop')}
          disabled={isProcessing}
          className="text-lg px-4"
          title="Стоп"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            '🛑'
          )}
        </Button>
      </div>
    </div>
  );
}
