import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  BarChart3, 
  RefreshCw, 
  TrendingUp,
  Users,
  MessageSquare,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { cn } from '@/lib/utils';

interface AnalyticsSummary {
  totalSessions: number;
  uniqueVersions: string[];
  aggregatedMetrics: {
    entriesCreated: number;
    entriesEdited: number;
    aiChatMessages: number;
    aiBiographiesGenerated: number;
    autoMoodSuggestions: number;
    autoMoodAccepted: number;
    autoTagsSuggested: number;
    autoTagsAccepted: number;
    feedbackSubmitted: number;
    avgSessionMinutes: number;
  };
  dailyData: Array<{
    date: string;
    sessions: number;
    entries: number;
    aiMessages: number;
  }>;
}

export default function AdminAnalyticsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, tokenData } = useAdminAccess();
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const fetchAnalytics = async () => {
    if (!tokenData?.token) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-analytics-summary?days=${days}`,
        {
          headers: {
            'x-admin-token': tokenData.token,
            'Content-Type': 'application/json',
          },
        }
      );
      
      const data = await response.json();
      if (data.success) {
        setAnalytics(data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [tokenData, days]);

  const calcConversion = (accepted: number, suggested: number) => {
    if (suggested === 0) return 0;
    return Math.round((accepted / suggested) * 100);
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
                <BarChart3 className="h-5 w-5 text-violet-400" />
                Аналитика
              </h1>
              <p className="text-xs text-muted-foreground">
                Статистика за {days} дней
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={days === 7 ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDays(7)}
              >
                7д
              </Button>
              <Button
                variant={days === 30 ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDays(30)}
              >
                30д
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={fetchAnalytics}
                className="h-8 w-8"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : !analytics ? (
          <Card className="bg-card/60">
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Нет данных за выбранный период</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Key metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="bg-card/60">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Сессий
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {analytics.totalSessions}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Ср. длина: {analytics.aggregatedMetrics.avgSessionMinutes} мин
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/60">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Записей создано
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {analytics.aggregatedMetrics.entriesCreated}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Отредактировано: {analytics.aggregatedMetrics.entriesEdited}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/60">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    AI сообщений
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {analytics.aggregatedMetrics.aiChatMessages}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Биографий: {analytics.aggregatedMetrics.aiBiographiesGenerated}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Conversion metrics */}
            <Card className="bg-card/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Конверсия AI-функций
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Auto Mood */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Авто-настроение</span>
                      <span className="font-medium">
                        {calcConversion(
                          analytics.aggregatedMetrics.autoMoodAccepted,
                          analytics.aggregatedMetrics.autoMoodSuggestions
                        )}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all"
                        style={{ 
                          width: `${calcConversion(
                            analytics.aggregatedMetrics.autoMoodAccepted,
                            analytics.aggregatedMetrics.autoMoodSuggestions
                          )}%` 
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analytics.aggregatedMetrics.autoMoodAccepted} / {analytics.aggregatedMetrics.autoMoodSuggestions}
                    </p>
                  </div>

                  {/* Auto Tags */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Авто-теги</span>
                      <span className="font-medium">
                        {calcConversion(
                          analytics.aggregatedMetrics.autoTagsAccepted,
                          analytics.aggregatedMetrics.autoTagsSuggested
                        )}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all"
                        style={{ 
                          width: `${calcConversion(
                            analytics.aggregatedMetrics.autoTagsAccepted,
                            analytics.aggregatedMetrics.autoTagsSuggested
                          )}%` 
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {analytics.aggregatedMetrics.autoTagsAccepted} / {analytics.aggregatedMetrics.autoTagsSuggested}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Version breakdown */}
            {analytics.uniqueVersions.length > 0 && (
              <Card className="bg-card/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    Версии приложения
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analytics.uniqueVersions.map(version => (
                      <span 
                        key={version}
                        className="px-3 py-1 bg-muted rounded-full text-sm"
                      >
                        v{version}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily chart placeholder */}
            {analytics.dailyData.length > 0 && (
              <Card className="bg-card/60">
                <CardHeader>
                  <CardTitle className="text-base">По дням</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analytics.dailyData.slice(0, 7).map(day => (
                      <div key={day.date} className="flex items-center gap-4 text-sm">
                        <span className="w-20 text-muted-foreground">
                          {new Date(day.date).toLocaleDateString('ru-RU', { 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <div 
                            className="h-4 bg-violet-500/50 rounded"
                            style={{ width: `${Math.min(day.entries * 10, 100)}%` }}
                          />
                          <span className="text-xs">{day.entries} записей</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
