import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, TrendingUp, Store, Tag, AlertTriangle, Calendar, Wallet, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useI18n, isRTL } from "@/lib/i18n";
import {
  type DateRangePreset,
  type DateRange,
  type ReceiptAnalytics,
  getDateRangeFromPreset,
  calculateAnalytics,
} from "@/lib/receiptAnalyticsService";
import { exportFilteredReceiptsCsv, exportFilteredReceiptItemsCsv } from "@/lib/receiptExportService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

// Category colors for pie chart
const CATEGORY_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(190, 70%, 50%)",
  "hsl(280, 60%, 55%)",
  "hsl(45, 80%, 50%)",
];

function ReceiptAnalyticsContent() {
  const navigate = useNavigate();
  const { language, t } = useI18n();

  // Filter state
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");

  // Analytics data
  const [analytics, setAnalytics] = useState<ReceiptAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Export handlers
  const handleExportReceipts = async () => {
    toast.info(t('receipts.preparingCsv'));
    try {
      const filters = { dateRange, currency: currencyFilter !== "all" ? currencyFilter : undefined };
      await exportFilteredReceiptsCsv(filters);
      toast.success(t('receipts.csvDownloaded'));
    } catch (error: any) {
      toast.error(error.message || t('receipts.noDataToExport'));
    }
  };

  const handleExportItems = async () => {
    toast.info(t('receipts.preparingCsv'));
    try {
      const filters = { dateRange, currency: currencyFilter !== "all" ? currencyFilter : undefined };
      await exportFilteredReceiptItemsCsv(filters);
      toast.success(t('receipts.csvDownloaded'));
    } catch (error: any) {
      toast.error(error.message || t('receipts.noDataToExport'));
    }
  };

  // Get date range based on preset
  const dateRange = useMemo<DateRange>(() => {
    if (preset === "custom" && customStart && customEnd) {
      return {
        start: new Date(customStart),
        end: new Date(customEnd),
      };
    }
    return getDateRangeFromPreset(preset);
  }, [preset, customStart, customEnd]);

  // Load analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const data = await calculateAnalytics({
          dateRange,
          currency: currencyFilter !== "all" ? currencyFilter : undefined,
        });
        setAnalytics(data);
      } catch (error) {
        console.error("Failed to load analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [dateRange, currencyFilter]);

  // Format currency amount
  const formatCurrency = (amount: number, currency: string | null) => {
    const curr = currency || "USD";
    try {
      return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
        style: "currency",
        currency: curr,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${curr}`;
    }
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!analytics) return [];
    return analytics.dailyTrend.map((d) => ({
      date: format(new Date(d.date), "dd.MM"),
      total: d.total,
      receipts: d.receiptCount,
    }));
  }, [analytics]);

  // Date range presets
  const presetOptions: { value: DateRangePreset; label: { ru: string; en: string } }[] = [
    { value: "7d", label: { ru: "7 дней", en: "7 days" } },
    { value: "30d", label: { ru: "30 дней", en: "30 days" } },
    { value: "thisMonth", label: { ru: "Этот месяц", en: "This month" } },
    { value: "lastMonth", label: { ru: "Прошлый месяц", en: "Last month" } },
    { value: "custom", label: { ru: "Выбрать даты", en: "Custom" } },
  ];

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/receipts")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-serif font-medium text-foreground">
              {language === "ru" ? "Аналитика расходов" : "Expense Analytics"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(dateRange.start, "dd.MM.yy")} — {format(dateRange.end, "dd.MM.yy")}
            </p>
          </div>
          {/* Export dropdown */}
          {analytics && analytics.summary.receiptCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-cyber-sigil">
                  <Download className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportReceipts}>
                  {t('receipts.exportReceipts')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportItems}>
                  {t('receipts.exportItems')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        {/* Filters */}
        <Card className="panel-glass border-cyber-glow/20">
          <CardContent className="py-4 space-y-3">
            {/* Date preset */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyber-sigil flex-shrink-0" />
              <Select value={preset} onValueChange={(v) => setPreset(v as DateRangePreset)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presetOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label[language]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom date inputs */}
            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {language === "ru" ? "От" : "From"}
                  </Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {language === "ru" ? "До" : "To"}
                  </Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Currency filter */}
            {analytics && analytics.currencies.length > 0 && (
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-cyber-sigil flex-shrink-0" />
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {language === "ru" ? "Все валюты" : "All currencies"}
                    </SelectItem>
                    {analytics.currencies.map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Multiple currencies warning */}
            {analytics?.multipleCurrencies && currencyFilter === "all" && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {language === "ru"
                    ? "Суммы в разных валютах. Выберите одну валюту для точного анализа."
                    : "Multiple currencies detected. Select one currency for accurate totals."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : analytics ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="panel-glass border-cyber-glow/20">
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">
                    {language === "ru" ? "Всего потрачено" : "Total Spent"}
                  </p>
                  <p className="text-2xl font-bold font-mono mt-1">
                    {formatCurrency(analytics.summary.totalSpend, analytics.summary.currency)}
                  </p>
                </CardContent>
              </Card>
              <Card className="panel-glass border-cyber-glow/20">
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">
                    {language === "ru" ? "Чеков" : "Receipts"}
                  </p>
                  <p className="text-2xl font-bold font-mono mt-1">{analytics.summary.receiptCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {formatCurrency(analytics.summary.avgPerReceipt, analytics.summary.currency)}{" "}
                    {language === "ru" ? "/ чек" : "/ receipt"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend Chart */}
            {chartData.length > 0 && (
              <Card className="panel-glass border-cyber-glow/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyber-sigil" />
                    {language === "ru" ? "Расходы по дням" : "Daily Spending"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => v.toFixed(0)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#colorTotal)"
                          name={language === "ru" ? "Сумма" : "Amount"}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category Breakdown */}
            {analytics.categoryBreakdown.length > 0 && (
              <Card className="panel-glass border-cyber-glow/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Tag className="h-4 w-4 text-cyber-sigil" />
                    {language === "ru" ? "По категориям" : "By Category"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4">
                    {/* Pie chart */}
                    <div className="w-24 h-24 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.categoryBreakdown}
                            dataKey="total"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={20}
                            outerRadius={40}
                            paddingAngle={2}
                          >
                            {analytics.categoryBreakdown.map((_, index) => (
                              <Cell key={index} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex-1 space-y-1.5">
                      {analytics.categoryBreakdown.slice(0, 5).map((cat, index) => (
                        <div key={cat.category} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                            />
                            <span className="capitalize truncate max-w-24">{cat.category}</span>
                          </div>
                          <span className="font-mono text-muted-foreground">
                            {cat.percentage.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Stores */}
            {analytics.storeBreakdown.length > 0 && (
              <Card className="panel-glass border-cyber-glow/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Store className="h-4 w-4 text-cyber-sigil" />
                    {language === "ru" ? "Топ магазины" : "Top Stores"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {analytics.storeBreakdown.slice(0, 5).map((store, index) => (
                    <div key={store.storeName} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">#{index + 1}</span>
                        <span className="text-sm truncate max-w-40">{store.storeName}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm">
                          {formatCurrency(store.total, analytics.summary.currency)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({store.receiptCount})
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {analytics.summary.receiptCount === 0 && (
              <Card className="panel-glass border-cyber-glow/20">
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    {language === "ru" ? "Нет данных за выбранный период" : "No data for selected period"}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

export default function ReceiptAnalyticsPage() {
  return (
    <ErrorBoundary>
      <ReceiptAnalyticsContent />
    </ErrorBoundary>
  );
}
