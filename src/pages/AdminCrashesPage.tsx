import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bug, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { cn } from '@/lib/utils';
import { formatDeviceInfoSummary } from '@/lib/deviceInfo';

interface CrashReport {
  id: string;
  message: string;
  stack: string | null;
  component_stack: string | null;
  url: string | null;
  app_version: string | null;
  session_id: string | null;
  device_info: Record<string, unknown>;
  breadcrumbs: string[];
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'investigating', label: 'В работе' },
  { value: 'resolved', label: 'Решено' },
  { value: 'ignored', label: 'Игнор' },
];

export default function AdminCrashesPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData } = useAdminAccess();
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('new');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const fetchCrashes = async () => {
    if (!tokenData?.token) return;
    
    setIsLoading(true);
    try {
      const url = new URL(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-crashes-list`
      );
      if (statusFilter !== 'all') {
        url.searchParams.set('status', statusFilter);
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          'x-admin-token': tokenData.token,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      if (data.success) {
        setCrashes(data.crashes || []);
      }
    } catch (error) {
      console.error('Failed to fetch crashes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCrashes();
  }, [tokenData, statusFilter]);

  const updateStatus = async (id: string, newStatus: string) => {
    if (!tokenData?.token) return;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-crashes-update`,
        {
          method: 'POST',
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id, status: newStatus }),
        }
      );
      
      if (response.ok) {
        setCrashes(prev => 
          prev.map(c => c.id === id ? { ...c, status: newStatus } : c)
        );
      }
    } catch (error) {
      console.error('Failed to update crash status:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Новая</Badge>;
      case 'investigating':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> В работе</Badge>;
      case 'resolved':
        return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Решено</Badge>;
      case 'ignored':
        return <Badge variant="outline" className="gap-1">Игнор</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background starry-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/admin/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-lg font-serif flex items-center gap-2">
                <Bug className="h-5 w-5 text-destructive" />
                Crash Reports
              </h1>
              <p className="text-xs text-muted-foreground">
                {crashes.length} {crashes.length === 1 ? 'ошибка' : 'ошибок'}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={fetchCrashes}
              className="h-8 w-8"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Crashes list */}
      <main className="max-w-4xl mx-auto px-4 pb-8">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : crashes.length === 0 ? (
          <Card className="bg-card/60">
            <CardContent className="py-12 text-center">
              <Bug className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Нет ошибок с выбранным статусом</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {crashes.map(crash => (
              <Collapsible
                key={crash.id}
                open={expandedId === crash.id}
                onOpenChange={(open) => setExpandedId(open ? crash.id : null)}
              >
                <Card className="bg-card/60 overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {getStatusBadge(crash.status)}
                            {crash.occurrence_count > 1 && (
                              <Badge variant="outline">
                                ×{crash.occurrence_count}
                              </Badge>
                            )}
                            {crash.app_version && (
                              <Badge variant="secondary" className="text-xs">
                                v{crash.app_version}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-sm font-mono text-destructive truncate">
                            {crash.message}
                          </CardTitle>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{formatDate(crash.last_seen_at)}</span>
                            {crash.device_info && (
                              <span className="flex items-center gap-1">
                                {crash.device_info.pwa ? (
                                  <Smartphone className="h-3 w-3" />
                                ) : (
                                  <Monitor className="h-3 w-3" />
                                )}
                                {formatDeviceInfoSummary(crash.device_info as any)}
                              </span>
                            )}
                          </div>
                        </div>
                        {expandedId === crash.id ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      {/* Stack trace */}
                      {crash.stack && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">
                            Stack Trace
                          </h4>
                          <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-48 scrollbar-thin">
                            {crash.stack}
                          </pre>
                        </div>
                      )}

                      {/* Breadcrumbs */}
                      {crash.breadcrumbs && crash.breadcrumbs.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">
                            Breadcrumbs
                          </h4>
                          <div className="text-xs bg-muted/50 p-3 rounded-lg space-y-1">
                            {crash.breadcrumbs.map((crumb, i) => (
                              <div key={i} className="text-muted-foreground">
                                {crumb}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* URL */}
                      {crash.url && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-1">
                            URL
                          </h4>
                          <code className="text-xs text-muted-foreground">
                            {crash.url}
                          </code>
                        </div>
                      )}

                      {/* Status actions */}
                      <div className="flex gap-2 pt-2">
                        {crash.status !== 'investigating' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateStatus(crash.id, 'investigating')}
                          >
                            В работу
                          </Button>
                        )}
                        {crash.status !== 'resolved' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-green-600"
                            onClick={() => updateStatus(crash.id, 'resolved')}
                          >
                            Решено
                          </Button>
                        )}
                        {crash.status !== 'ignored' && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateStatus(crash.id, 'ignored')}
                          >
                            Игнорировать
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
