import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  RefreshCw, 
  Server, 
  Database,
  HardDrive,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  KeyRound,
  Copy,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { cn } from '@/lib/utils';

interface FunctionStatus {
  name: string;
  displayName: string;
  status: 'ok' | 'error' | 'checking';
  latency?: number;
}

interface SystemHealth {
  database: 'ok' | 'error' | 'checking';
  feedback: {
    total: number;
    new: number;
  };
  storage: {
    bucket: string;
    files: number;
  };
  timestamp: number;
}

const FUNCTIONS_TO_CHECK = [
  { name: 'ai-chat', displayName: 'AI Чат' },
  { name: 'ai-biography', displayName: 'AI Биография' },
  { name: 'ai-receipt', displayName: 'AI Чеки' },
  { name: 'ai-whisper', displayName: 'AI Шёпот' },
  { name: 'feedback-submit', displayName: 'Отправка посланий' },
];

export default function AdminSystemPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData } = useAdminAccess();
  const [isLoading, setIsLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [functions, setFunctions] = useState<FunctionStatus[]>(
    FUNCTIONS_TO_CHECK.map(f => ({ ...f, status: 'checking' }))
  );
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  // AI PIN management state
  const [pinStatus, setPinStatus] = useState<{ configured: boolean; updatedAt: string | null } | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [invalidateSessions, setInvalidateSessions] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const checkSystemHealth = useCallback(async () => {
    if (!tokenData?.token) return;

    setIsLoading(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-system-health`,
        {
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch system health');
      }

      const data = await response.json();
      
      if (data.success) {
        setSystemHealth(data.data);
        
        // Update function statuses
        setFunctions(prev => prev.map(f => ({
          ...f,
          status: data.data.functions?.[f.name]?.status || 'ok',
          latency: data.data.functions?.[f.name]?.latency,
        })));
      }
    } catch (error) {
      console.error('System health check error:', error);
      setSystemHealth({
        database: 'error',
        feedback: { total: 0, new: 0 },
        storage: { bucket: 'feedback-attachments', files: 0 },
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
      setLastCheck(new Date());
    }
  }, [tokenData]);

  // Fetch AI PIN status
  const fetchPinStatus = useCallback(async () => {
    if (!tokenData?.token) return;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-pin-manage`,
        {
          method: 'GET',
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        setPinStatus({ configured: data.configured, updatedAt: data.updatedAt });
      }
    } catch (error) {
      console.error('Failed to fetch PIN status:', error);
    }
  }, [tokenData]);

  // Generate new PIN
  const handleGeneratePin = useCallback(async () => {
    if (!tokenData?.token) return;

    setIsPinLoading(true);
    setGeneratedPin(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-pin-manage`,
        {
          method: 'POST',
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ invalidateSessions }),
        }
      );

      const data = await response.json();
      if (data.success && data.pin) {
        setGeneratedPin(data.pin);
        // Refresh status
        fetchPinStatus();
      }
    } catch (error) {
      console.error('Failed to generate PIN:', error);
    } finally {
      setIsPinLoading(false);
    }
  }, [tokenData, invalidateSessions, fetchPinStatus]);

  // Copy PIN to clipboard
  const handleCopyPin = useCallback(async () => {
    if (!generatedPin) return;
    try {
      await navigator.clipboard.writeText(generatedPin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    } catch {
      // Fallback for insecure context
      const textArea = document.createElement('textarea');
      textArea.value = generatedPin;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  }, [generatedPin]);

  useEffect(() => {
    checkSystemHealth();
    fetchPinStatus();
  }, [checkSystemHealth, fetchPinStatus]);

  const getStatusIcon = (status: 'ok' | 'error' | 'checking') => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'checking':
        return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: 'ok' | 'error' | 'checking') => {
    switch (status) {
      case 'ok':
        return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">Работает</Badge>;
      case 'error':
        return <Badge variant="destructive">Ошибка</Badge>;
      case 'checking':
        return <Badge variant="secondary">Проверка...</Badge>;
    }
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background starry-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Назад</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-serif text-foreground">Состояние системы</h1>
              {lastCheck && (
                <p className="text-xs text-muted-foreground">
                  Проверено: {lastCheck.toLocaleTimeString('ru-RU')}
                </p>
              )}
            </div>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={checkSystemHealth}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* AI PIN Management Card */}
        <Card className="bg-card/60 backdrop-blur-sm border-violet-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-violet-400" />
              <CardTitle className="text-base">AI PIN-код</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Статус</span>
              {pinStatus === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : pinStatus.configured ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
                  Настроен
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                  Используется статический
                </Badge>
              )}
            </div>

            {pinStatus?.updatedAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Последняя смена</span>
                <span className="text-foreground text-xs">
                  {new Date(pinStatus.updatedAt).toLocaleString('ru-RU')}
                </span>
              </div>
            )}

            <Separator />

            {/* Generated PIN display */}
            {generatedPin && (
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-violet-300">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Новый PIN-код (покажется один раз)</span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl font-mono font-bold tracking-[0.3em] text-foreground">
                    {generatedPin}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyPin}
                    className="shrink-0"
                  >
                    {pinCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Старый PIN перестал работать. Запишите новый.
                </p>
              </div>
            )}

            {/* Invalidate sessions checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={invalidateSessions}
                onCheckedChange={(checked) => setInvalidateSessions(checked === true)}
              />
              <span className="text-sm text-muted-foreground">
                Отозвать все активные AI-сессии
              </span>
            </label>

            {/* Generate button */}
            <Button
              onClick={handleGeneratePin}
              disabled={isPinLoading}
              className="w-full gap-2"
              variant="secondary"
            >
              {isPinLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Сгенерировать новый PIN
            </Button>
          </CardContent>
        </Card>

        {/* Database & Storage Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-violet-400" />
                <CardTitle className="text-sm font-medium">База данных</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {getStatusBadge(systemHealth?.database || 'checking')}
                {systemHealth && (
                  <span className="text-xs text-muted-foreground">
                    {systemHealth.feedback.total} записей
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-violet-400" />
                <CardTitle className="text-sm font-medium">Хранилище</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {getStatusBadge(systemHealth ? 'ok' : 'checking')}
                {systemHealth && (
                  <span className="text-xs text-muted-foreground">
                    {systemHealth.storage.files} файлов
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edge Functions Status */}
        <Card className="bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-violet-400" />
              <CardTitle className="text-base">Edge Functions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {functions.map((func, index) => (
              <div key={func.name}>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(func.status)}
                    <span className="text-sm">{func.displayName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {func.latency && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatLatency(func.latency)}
                      </span>
                    )}
                    {getStatusBadge(func.status)}
                  </div>
                </div>
                {index < functions.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Feedback Summary */}
        <Card className="bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-violet-400" />
              <CardTitle className="text-base">Статистика посланий</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : systemHealth ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <p className="text-2xl font-bold text-foreground">{systemHealth.feedback.total}</p>
                  <p className="text-xs text-muted-foreground">Всего</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <p className={cn(
                    "text-2xl font-bold",
                    systemHealth.feedback.new > 0 ? "text-violet-400" : "text-foreground"
                  )}>
                    {systemHealth.feedback.new}
                  </p>
                  <p className="text-xs text-muted-foreground">Новых</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Нет данных
              </p>
            )}
          </CardContent>
        </Card>

        {/* App Info */}
        <Card className="bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Версия приложения</span>
              <span className="text-foreground font-mono">1.0.0</span>
            </div>
            {systemHealth && (
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">Последняя активность</span>
                <span className="text-foreground">
                  {new Date(systemHealth.timestamp).toLocaleString('ru-RU')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
