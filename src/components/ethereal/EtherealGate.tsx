import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { isEtherealSessionValid, clearEtherealSession } from '@/lib/etherealTokenService';
import { EtherealPinModal } from './EtherealPinModal';
import { EtherealBottomTabs } from './EtherealBottomTabs';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  title: { ru: 'Приватное пространство', en: 'Private Space' },
  description: { ru: 'Для доступа требуется общий PIN.', en: 'This area requires a shared PIN to access.' },
  enterPin: { ru: 'Ввести PIN', en: 'Enter PIN' },
  returnHome: { ru: 'На главную', en: 'Return Home' },
} as const;

export function EtherealGate() {
  const [sessionValid, setSessionValid] = useState(() => isEtherealSessionValid());
  const [showPin, setShowPin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];

  // Listen for session expiration events
  useEffect(() => {
    const handleExpired = () => {
      setSessionValid(false);
      setShowPin(true);
    };

    window.addEventListener('ethereal-session-expired', handleExpired);
    return () => window.removeEventListener('ethereal-session-expired', handleExpired);
  }, []);

  // Check session on mount and navigation
  useEffect(() => {
    setSessionValid(isEtherealSessionValid());
  }, [location.pathname]);

  const handleLeave = () => {
    clearEtherealSession();
    navigate('/');
  };

  if (!sessionValid) {
    return (
      <div className="ethereal min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-medium mb-2">{t('title')}</h1>
            <p className="text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setShowPin(true)} size="lg">
              {t('enterPin')}
            </Button>
            <Button variant="ghost" onClick={handleLeave}>
              {t('returnHome')}
            </Button>
          </div>
        </div>

        <EtherealPinModal open={showPin} onOpenChange={setShowPin} />
      </div>
    );
  }

  return (
    <div className="ethereal min-h-screen flex flex-col yacht-gradient">
      <div className="flex-1 overflow-auto pb-20">
        <Outlet />
      </div>
      <EtherealBottomTabs />
    </div>
  );
}
