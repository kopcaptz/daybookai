import { useState } from 'react';
import { Loader2, ShieldCheck, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BoundariesSelector } from './BoundariesSelector';
import { AdultLevelSelector } from './AdultLevelSelector';
import { GameSession, Boundaries, setConsent, setLevel, getLevelLabel } from '@/lib/gameService';

interface ConsentModalProps {
  open: boolean;
  session: GameSession;
  myRole: 'picker' | 'responder';
  onConsentGiven: () => void;
  onClose: () => void;
}

export function ConsentModal({
  open,
  session,
  myRole,
  onConsentGiven,
  onClose,
}: ConsentModalProps) {
  const [boundaries, setBoundaries] = useState<Boundaries>(session.boundaries || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDownshift, setShowDownshift] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicker = myRole === 'picker';
  const levelInfo = getLevelLabel(session.adult_level);
  const hasMyConsent = isPicker ? session.consent_picker : session.consent_responder;
  const hasPartnerConsent = isPicker ? session.consent_responder : session.consent_picker;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    const result = await setConsent(session.id, boundaries);
    
    if (result.success) {
      onConsentGiven();
    } else {
      setError(result.error || 'Не удалось подтвердить');
    }
    setIsSubmitting(false);
  };

  const handleDownshift = async (level: number) => {
    setIsSubmitting(true);
    setError(null);

    const result = await setLevel(session.id, level);
    
    if (result.success) {
      onConsentGiven();
    } else {
      setError(result.error || 'Не удалось изменить уровень');
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Подтверждение уровня
          </DialogTitle>
          <DialogDescription>
            {isPicker
              ? 'Установите ограничения для игры'
              : `Партнёр предлагает уровень ${levelInfo.name} ${levelInfo.icon || ''}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Level display for responder */}
          {!isPicker && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{levelInfo.name}</span>
                {levelInfo.icon && <span>{levelInfo.icon}</span>}
              </div>
              <p className="text-sm text-muted-foreground">
                {levelInfo.description}
              </p>
            </div>
          )}

          {/* Boundaries */}
          <BoundariesSelector
            value={boundaries}
            onChange={setBoundaries}
            disabled={isSubmitting}
          />

          {/* Consent status */}
          <div className="text-sm text-muted-foreground">
            {hasMyConsent ? (
              <span className="text-green-600">✓ Вы подтвердили</span>
            ) : (
              <span>Ожидается ваше подтверждение</span>
            )}
            {' • '}
            {hasPartnerConsent ? (
              <span className="text-green-600">✓ Партнёр подтвердил</span>
            ) : (
              <span>Ожидается подтверждение партнёра</span>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {!hasMyConsent && (
              <Button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                Согласен на уровень {levelInfo.name}
              </Button>
            )}

            {/* Downshift option for responder */}
            {!isPicker && session.adult_level > 0 && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setShowDownshift(!showDownshift)}
                  className="w-full text-muted-foreground"
                  disabled={isSubmitting}
                >
                  <ChevronDown className={`w-4 h-4 mr-2 transition-transform ${showDownshift ? 'rotate-180' : ''}`} />
                  Предложить снизить уровень
                </Button>

                {showDownshift && (
                  <div className="space-y-2 p-3 bg-secondary/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      Выберите комфортный уровень:
                    </p>
                    <AdultLevelSelector
                      value={-1}
                      onChange={handleDownshift}
                      disabled={isSubmitting}
                      maxLevel={session.adult_level - 1}
                    />
                  </div>
                )}
              </>
            )}

            {hasMyConsent && !hasPartnerConsent && (
              <p className="text-sm text-center text-muted-foreground py-2">
                Ожидание подтверждения партнёра...
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
