import { useState } from 'react';
import { SkipForward, ChevronDown, Pause, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { skipSituation, setLevel, getLevelLabel, LEVEL_LABELS } from '@/lib/gameService';

interface SafetyControlsProps {
  sessionId: string;
  currentLevel: number;
  onUpdate: () => void;
  onPause?: () => void;
}

export function SafetyControls({
  sessionId,
  currentLevel,
  onUpdate,
  onPause,
}: SafetyControlsProps) {
  const [isSkipping, setIsSkipping] = useState(false);
  const [isChangingLevel, setIsChangingLevel] = useState(false);

  const handleSkip = async () => {
    setIsSkipping(true);
    const result = await skipSituation(sessionId);
    if (result.success) {
      onUpdate();
    }
    setIsSkipping(false);
  };

  const handleLevelChange = async (level: number) => {
    setIsChangingLevel(true);
    const result = await setLevel(sessionId, level);
    if (result.success) {
      onUpdate();
    }
    setIsChangingLevel(false);
  };

  const availableLevels = LEVEL_LABELS.filter((l) => l.level < currentLevel);
  const currentLevelInfo = getLevelLabel(currentLevel);

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Skip - most accessible */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSkip}
        disabled={isSkipping}
        className="text-muted-foreground hover:text-foreground"
      >
        {isSkipping ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1" />
        ) : (
          <SkipForward className="w-4 h-4 mr-1" />
        )}
        Сменить тему
      </Button>

      {/* Downshift level */}
      {currentLevel > 0 && availableLevels.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isChangingLevel}
              className="text-muted-foreground hover:text-foreground"
            >
              {isChangingLevel ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-1" />
              )}
              {currentLevelInfo.icon || 'Уровень'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {availableLevels.map((level) => (
              <DropdownMenuItem
                key={level.level}
                onClick={() => handleLevelChange(level.level)}
              >
                <span className="mr-2">{level.icon || '○'}</span>
                {level.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Pause */}
      {onPause && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onPause}
          className="text-muted-foreground hover:text-foreground ml-auto"
        >
          <Pause className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
