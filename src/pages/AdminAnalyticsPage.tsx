import { useState, useEffect, useMemo } from 'react';
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
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
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

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!analytics?.dailyData) return [];
    return analytics.dailyData
      .slice()
      .reverse()
      .map(day => ({
        date: new Date(day.date).toLocaleDateString('ru-RU', { 
          day: 'numeric', 
          month: 'short' 
        }),
        sessions: day.sessions,
        entries: day.entries,
        aiMessages: day.aiMessages,
      }));
  }, [analytics]);

  const aiUsageData = useMemo(() => {
    if (!analytics) return [];
    const m = analytics.aggregatedMetrics;
    return [
      { name: 'Чат', value: m.aiChatMessages },
      { name: 'Биографии', value: m.aiBiographiesGenerated },
      { name: 'Авто-теги', value: m.autoTagsAccepted },
      { name: 'Авто-mood', value: m.autoMoodAccepted },
    ];
  }, [analytics]);

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
                <BarChart3 className="h-5 w-5 text-primary" />
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

            {/* Daily Activity LineChart */}
            {chartData.length > 0 && (
              <Card className="bg-card/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Активность по дням
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          className="stroke-border" 
                          opacity={0.3} 
                        />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 11 }}
                          className="fill-muted-foreground"
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }}
                          className="fill-muted-foreground"
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '12px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="sessions" 
                          stroke="hsl(var(--chart-1))" 
                          strokeWidth={2}
                          dot={{ r: 3, fill: 'hsl(var(--chart-1))' }}
                          name="Сессии"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="entries" 
                          stroke="hsl(var(--chart-2))" 
                          strokeWidth={2}
                          dot={{ r: 3, fill: 'hsl(var(--chart-2))' }}
                          name="Записи"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="aiMessages" 
                          stroke="hsl(var(--chart-3))" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: 'hsl(var(--chart-3))' }}
                          name="AI чат"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Usage BarChart */}
            <Card className="bg-card/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Использование AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={aiUsageData} 
                      layout="vertical" 
                      margin={{ top: 5, right: 30, left: 70, bottom: 5 }}
                    >
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        className="stroke-border" 
                        opacity={0.3} 
                        horizontal={false}
                      />
                      <XAxis 
                        type="number"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        className="fill-foreground"
                        axisLine={false}
                        tickLine={false}
                        width={65}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value) => [value, 'Использований']}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar 
                        dataKey="value" 
                        radius={[0, 4, 4, 0]}
                        fill="hsl(var(--primary))"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Conversion metrics */}
            <Card className="bg-card/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-chart-3" />
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
                        className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
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
                        className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
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
                    <Sparkles className="h-4 w-4 text-primary" />
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
          </>
        )}
      </main>
    </div>
  );
}
