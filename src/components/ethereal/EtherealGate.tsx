import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { isEtherealSessionValid, clearEtherealSession } from '@/lib/etherealTokenService';
import { EtherealPinModal } from './EtherealPinModal';
import { EtherealBottomTabs } from './EtherealBottomTabs';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export function EtherealGate() {
  const [sessionValid, setSessionValid] = useState(() => isEtherealSessionValid());
  const [showPin, setShowPin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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
            <h1 className="text-2xl font-serif font-medium mb-2">Private Space</h1>
            <p className="text-muted-foreground">
              This area requires a shared PIN to access.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setShowPin(true)} size="lg">
              Enter PIN
            </Button>
            <Button variant="ghost" onClick={handleLeave}>
              Return Home
            </Button>
          </div>
        </div>

        <EtherealPinModal open={showPin} onOpenChange={setShowPin} />
      </div>
    );
  }

  return (
    <div className="ethereal min-h-screen flex flex-col bg-background">
      <div className="flex-1 overflow-auto pb-20">
        <Outlet />
      </div>
      <EtherealBottomTabs />
    </div>
  );
}
