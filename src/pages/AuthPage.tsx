import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Mail, Lock, LogIn, UserPlus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';

const emailSchema = z.string().email();
const passwordSchema = z.string().min(6);

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, loading, signIn, signUp } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const t = (ru: string, en: string) => language === 'ru' ? ru : en;

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!emailSchema.safeParse(email).success) {
      newErrors.email = t('Введите корректный email', 'Enter a valid email');
    }
    if (!passwordSchema.safeParse(password).success) {
      newErrors.password = t('Минимум 6 символов', 'At least 6 characters');
    }
    if (mode === 'signup' && password !== confirmPassword) {
      newErrors.confirm = t('Пароли не совпадают', 'Passwords do not match');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error(t('Неверный email или пароль', 'Invalid email or password'));
          } else if (error.message.includes('Email not confirmed')) {
            toast.error(t('Подтвердите email (проверьте почту)', 'Please confirm your email (check inbox)'));
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success(t('Вы вошли в аккаунт', 'Signed in successfully'));
      } else {
        const { data, error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            toast.error(t('Этот email уже зарегистрирован', 'This email is already registered'));
          } else {
            toast.error(error.message);
          }
          return;
        }
        // Check if email confirmation is required
        if (data?.user && !data.session) {
          toast.success(t(
            'Проверьте почту — мы отправили ссылку для подтверждения',
            'Check your inbox — we sent a confirmation link'
          ));
        } else {
          toast.success(t('Аккаунт создан', 'Account created'));
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 cyber-noise rune-grid">
      {/* Back to app link */}
      <div className="w-full max-w-sm mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('Назад', 'Back')}
        </Button>
      </div>

      <Card className="w-full max-w-sm panel-glass border-cyber-glow/20">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-serif">
            {mode === 'login'
              ? t('Вход в аккаунт', 'Sign In')
              : t('Регистрация', 'Sign Up')
            }
          </CardTitle>
          <CardDescription>
            {t('Для синхронизации записей между устройствами', 'To sync entries across devices')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })); }}
                  className="pl-10 bg-muted/50 border-border/50"
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={t('Пароль', 'Password')}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }}
                  className="pl-10 bg-muted/50 border-border/50"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            {/* Confirm Password (signup only) */}
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder={t('Подтвердите пароль', 'Confirm password')}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirm: undefined })); }}
                    className="pl-10 bg-muted/50 border-border/50"
                    autoComplete="new-password"
                  />
                </div>
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submitting}
            >
              {mode === 'login' ? (
                <>
                  <LogIn className="h-4 w-4" />
                  {submitting ? t('Вход...', 'Signing in...') : t('Войти', 'Sign In')}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {submitting ? t('Регистрация...', 'Signing up...') : t('Зарегистрироваться', 'Sign Up')}
                </>
              )}
            </Button>
          </form>

          {/* Toggle mode */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrors({}); }}
              className="text-sm text-primary hover:underline"
            >
              {mode === 'login'
                ? t('Нет аккаунта? Зарегистрируйтесь', 'No account? Sign up')
                : t('Уже есть аккаунт? Войти', 'Already have an account? Sign in')
              }
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
