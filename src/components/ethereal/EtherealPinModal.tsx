import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { setEtherealSession } from '@/lib/etherealTokenService';
import { getOrCreateDeviceId } from '@/lib/etherealDeviceId';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const texts = {
  title: { ru: 'Войти в каюту', en: 'Enter the Chamber' },
  description: { ru: 'Введите общий PIN для входа в приватное пространство.', en: 'Enter a shared PIN to join or create a private space.' },
  yourName: { ru: 'Ваше имя', en: 'Your Name' },
  namePlaceholder: { ru: 'Как вас будут видеть другие', en: 'How others will see you' },
  sharedPin: { ru: 'Общий PIN', en: 'Shared PIN' },
  pinPlaceholder: { ru: 'Минимум 4 символа', en: 'At least 4 characters' },
  pinHint: { ru: 'Один PIN = одна комната. Делитесь только с доверенными людьми.', en: 'Same PIN = same room. Share it only with trusted people.' },
  enter: { ru: 'Войти', en: 'Enter' },
  joining: { ru: 'Вход...', en: 'Joining...' },
  roomFull: { ru: 'Комната заполнена. Максимум 5 участников.', en: 'Room is full. Maximum 5 members allowed.' },
  pinTooShort: { ru: 'PIN должен быть минимум 4 символа.', en: 'PIN must be at least 4 characters.' },
  joinFailed: { ru: 'Не удалось войти. Попробуйте снова.', en: 'Failed to join. Please try again.' },
  networkError: { ru: 'Ошибка сети. Попробуйте снова.', en: 'Network error. Please try again.' },
} as const;

interface EtherealPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EtherealPinModal({ open, onOpenChange }: EtherealPinModalProps) {
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !displayName.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const deviceId = getOrCreateDeviceId();

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ethereal_join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          deviceId,
          displayName: displayName.trim(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        if (data.error === 'room_full') {
          setError(t('roomFull'));
        } else if (data.error === 'pin_too_short') {
          setError(t('pinTooShort'));
        } else {
          setError(t('joinFailed'));
        }
        return;
      }

      // Save session
      setEtherealSession({
        token: data.accessToken,
        roomId: data.roomId,
        memberId: data.memberId,
        channelKey: data.channelKey,
        expiresAt: data.expiresAt,
        isOwner: data.isOwner,
        displayName: displayName.trim(),
      });

      // Navigate to ethereal home
      onOpenChange(false);
      navigate('/e/home');
    } catch (err) {
      setError(t('networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-serif">{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">{t('yourName')}</Label>
            <Input
              id="displayName"
              placeholder={t('namePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">{t('sharedPin')}</Label>
            <Input
              id="pin"
              type="password"
              placeholder={t('pinPlaceholder')}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
              dir="ltr"
              className="text-left"
            />
            <p className="text-xs text-muted-foreground">
              {t('pinHint')}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || !pin || !displayName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('joining')}
              </>
            ) : (
              t('enter')
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
