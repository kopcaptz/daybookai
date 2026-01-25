import { useState, useRef, useEffect } from 'react';
import { KeyRound, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SigilIcon } from '@/components/icons/SigilIcon';

interface AIPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (pin: string) => Promise<{ success: boolean; error?: string }>;
  isVerifying: boolean;
  language: 'ru' | 'en';
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
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '']);
      setError(null);
      setSuccess(false);
      // Focus first input after a short delay
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [open]);
  
  const handleDigitChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);
    
    // Auto-advance to next input
    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Auto-submit when all digits entered
    if (digit && index === PIN_LENGTH - 1) {
      const pin = newDigits.join('');
      if (pin.length === PIN_LENGTH) {
        handleSubmit(pin);
      }
    }
  };
  
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
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
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      
      // Focus last filled input or submit
      if (pasted.length === PIN_LENGTH) {
        handleSubmit(pasted);
      } else {
        inputRefs.current[pasted.length]?.focus();
      }
    }
  };
  
  const handleSubmit = async (pin: string) => {
    if (isVerifying) return;
    
    const result = await onVerify(pin);
    
    if (result.success) {
      setSuccess(true);
      // Dialog will close via onVerify callback
    } else {
      setError(getErrorMessage(result.error, language));
      setDigits(['', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  };
  
  const getErrorMessage = (error: string | undefined, lang: 'ru' | 'en'): string => {
    switch (error) {
      case 'invalid_pin':
        return lang === 'ru' ? 'Неверный PIN-код' : 'Invalid PIN';
      case 'network_error':
        return lang === 'ru' ? 'Ошибка сети' : 'Network error';
      case 'service_not_configured':
        return lang === 'ru' ? 'Сервис не настроен' : 'Service not configured';
      default:
        return lang === 'ru' ? 'Ошибка проверки' : 'Verification error';
    }
  };
  
  const t = {
    title: language === 'ru' ? 'Доступ к ИИ' : 'AI Access',
    description: language === 'ru' 
      ? 'Введите 4-значный PIN для активации функций ИИ' 
      : 'Enter 4-digit PIN to enable AI features',
    verifying: language === 'ru' ? 'Проверка...' : 'Verifying...',
    success: language === 'ru' ? 'Доступ открыт!' : 'Access granted!',
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel-glass max-w-xs sm:max-w-sm">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyber-glow/10 border border-cyber-glow/30">
            {success ? (
              <CheckCircle2 className="h-7 w-7 text-cyber-sigil animate-pulse" />
            ) : (
              <SigilIcon className="h-7 w-7 text-cyber-sigil" />
            )}
          </div>
          <DialogTitle className="font-serif text-xl">
            {t.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {success ? t.success : t.description}
          </DialogDescription>
        </DialogHeader>
        
        {!success && (
          <div className="mt-4 space-y-4">
            {/* PIN Input Grid */}
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
            
            {/* Error Message */}
            {error && (
              <div className="flex items-center justify-center gap-2 text-sm text-destructive animate-fade-in">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            
            {/* Loading State */}
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
