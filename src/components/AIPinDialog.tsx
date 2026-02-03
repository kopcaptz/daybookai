import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SigilIcon } from '@/components/icons/SigilIcon';
import { getRateLimitRemainingSeconds } from '@/lib/aiTokenService';

interface AIPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (pin: string) => Promise<{ success: boolean; error?: string; retryAfter?: number }>;
  isVerifying: boolean;
  language: string;  // Accepts Language type from i18n
}

const PIN_LENGTH = 4;

export function AIPinDialog({
  open,
  onOpenChange,
  onVerify,
  isVerifying,
  language,
}: AIPinDialogProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Check for existing rate limit on open
  useEffect(() => {
    if (open) {
      const remaining = getRateLimitRemainingSeconds();
      setLockoutSeconds(remaining);
      setDigits(['', '', '', '']);
      setError(null);
      setSuccess(false);
      
      if (remaining === 0) {
        setTimeout(() => {
          inputRefs.current[0]?.focus();
        }, 100);
      }
    }
  }, [open]);
  
  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        const next = prev - 1;
        if (next <= 0) {
          // Re-focus input when lockout ends
          setTimeout(() => {
            inputRefs.current[0]?.focus();
          }, 100);
        }
        return Math.max(0, next);
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lockoutSeconds]);
  
  const formatLockoutTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);
  
  const handleDigitChange = (index: number, value: string) => {
    if (lockoutSeconds > 0) return;
    
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);
    
    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    if (digit && index === PIN_LENGTH - 1) {
      const pin = newDigits.join('');
      if (pin.length === PIN_LENGTH) {
        handleSubmit(pin);
      }
    }
  };
  
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (lockoutSeconds > 0) return;
    
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    if (e.key === 'Enter') {
      const pin = digits.join('');
      if (pin.length === PIN_LENGTH) {
        handleSubmit(pin);
      }
    }
  };
  
  const handlePaste = (e: React.ClipboardEvent) => {
    if (lockoutSeconds > 0) return;
    
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      
      if (pasted.length === PIN_LENGTH) {
        handleSubmit(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    }
  };
  
  const handleSubmit = async (pin: string) => {
    if (isVerifying || lockoutSeconds > 0) return;
    
    const result = await onVerify(pin);
    
    if (result.success) {
      setSuccess(true);
    } else if (result.error === 'rate_limited' && result.retryAfter) {
      setLockoutSeconds(result.retryAfter);
      setDigits(['', '', '', '']);
      setError(null);
    } else {
      setError(getErrorMessage(result.error, language));
      setDigits(['', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  };
  
  const getErrorMessage = (error: string | undefined, lang: string): string => {
    const baseLang = lang === 'ru' ? 'ru' : 'en';
    switch (error) {
      case 'invalid_pin':
        return baseLang === 'ru' ? 'Неверный PIN-код' : 'Invalid PIN';
      case 'network_error':
        return baseLang === 'ru' ? 'Ошибка сети' : 'Network error';
      case 'service_not_configured':
        return baseLang === 'ru' ? 'Сервис не настроен' : 'Service not configured';
      case 'rate_limited':
        return baseLang === 'ru' ? 'Слишком много попыток' : 'Too many attempts';
      default:
        return baseLang === 'ru' ? 'Ошибка проверки' : 'Verification error';
    }
  };
  
  const t = {
    title: language === 'ru' ? 'Доступ к ИИ' : 'AI Access',
    description: language === 'ru' 
      ? 'Введите 4-значный PIN для активации функций ИИ' 
      : 'Enter 4-digit PIN to enable AI features',
    verifying: language === 'ru' ? 'Проверка...' : 'Verifying...',
    success: language === 'ru' ? 'Доступ открыт!' : 'Access granted!',
    lockoutTitle: language === 'ru' ? 'Доступ заблокирован' : 'Access blocked',
    lockoutDescription: language === 'ru'
      ? 'Слишком много неудачных попыток. Подождите:'
      : 'Too many failed attempts. Please wait:',
  };
  
  const isLocked = lockoutSeconds > 0;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel-glass max-w-xs sm:max-w-sm">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyber-glow/10 border border-cyber-glow/30">
            {success ? (
              <CheckCircle2 className="h-7 w-7 text-cyber-sigil animate-pulse" />
            ) : isLocked ? (
              <Clock className="h-7 w-7 text-destructive animate-pulse" />
            ) : (
              <SigilIcon className="h-7 w-7 text-cyber-sigil" />
            )}
          </div>
          <DialogTitle className="font-serif text-xl">
            {isLocked ? t.lockoutTitle : t.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {success ? t.success : isLocked ? t.lockoutDescription : t.description}
          </DialogDescription>
        </DialogHeader>
        
        {/* Lockout Timer */}
        {isLocked && !success && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl font-mono font-bold text-destructive">
                {formatLockoutTime(lockoutSeconds)}
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full bg-destructive/50 transition-all duration-1000 ease-linear"
                  style={{ width: `${Math.min(100, (lockoutSeconds / 900) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* PIN Input */}
        {!success && !isLocked && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-center gap-3">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={isVerifying}
                  className={cn(
                    'h-14 w-12 rounded-lg border-2 bg-background/50 text-center text-2xl font-mono font-bold',
                    'focus:outline-none focus:ring-2 focus:ring-cyber-sigil focus:border-cyber-sigil',
                    'transition-all duration-200',
                    error 
                      ? 'border-destructive animate-shake' 
                      : digit 
                        ? 'border-cyber-glow/50' 
                        : 'border-border',
                    isVerifying && 'opacity-50'
                  )}
                  autoComplete="off"
                />
              ))}
            </div>
            
            {error && (
              <div className="flex items-center justify-center gap-2 text-sm text-destructive animate-fade-in">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            
            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.verifying}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
