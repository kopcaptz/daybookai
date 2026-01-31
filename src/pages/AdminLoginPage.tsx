import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { cn } from '@/lib/utils';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error, verifyPin } = useAdminAccess();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin/feedback', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || isLoading) return;

    const success = await verifyPin(pin);
    if (success) {
      navigate('/admin/feedback', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background starry-bg">
      <Card className={cn(
        "w-full max-w-md",
        "bg-card/80 backdrop-blur-xl",
        "border border-violet-500/30",
        "shadow-[0_0_40px_rgba(139,92,246,0.15)]"
      )}>
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-2">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-serif text-foreground">
            Портал Мастера
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Введите секретный код для доступа к архиву посланий
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN-код"
                className={cn(
                  "pr-10 text-center text-lg tracking-widest",
                  "bg-background/50 border-border/50",
                  "focus:border-violet-500/50 focus:ring-violet-500/20",
                  error && "border-destructive"
                )}
                maxLength={10}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={!pin.trim() || isLoading}
              className={cn(
                "w-full gap-2",
                "bg-gradient-to-r from-violet-600 to-indigo-600",
                "hover:from-violet-500 hover:to-indigo-500",
                "text-white font-medium",
                "shadow-[0_0_20px_rgba(139,92,246,0.25)]",
                "hover:shadow-[0_0_25px_rgba(139,92,246,0.4)]",
                "transition-all duration-300"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {isLoading ? "Проверка..." : "Войти в архив"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
