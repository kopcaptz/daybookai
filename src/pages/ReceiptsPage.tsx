import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Receipt, ScanLine, ChevronRight, Calendar, Store, Shield, TrendingUp, ArrowLeft, ArrowRight, Download, FileJson } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { db, type Receipt as ReceiptType } from "@/lib/db";
import { isReceiptScanningAvailable } from "@/lib/receiptService";
import { exportAllReceiptsCsv, exportAllReceiptItemsCsv } from "@/lib/receiptExportService";
import { downloadDiagnostics } from "@/lib/scanDiagnostics";
import { useI18n, isRTL } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

function ReceiptsContent() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [scanAvailability, setScanAvailability] = useState(() => isReceiptScanningAvailable());

  // Live query for receipts
  const receipts = useLiveQuery(
    () => db.receipts.orderBy("createdAt").reverse().toArray(),
    []
  );

  // Check availability on mount and when settings might change
  useEffect(() => {
    setScanAvailability(isReceiptScanningAvailable());
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return language === "ru" ? "Дата не указана" : "No date";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number | null, currency: string | null) => {
    if (amount === null) return "—";
    const curr = currency || "USD";
    try {
      return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
        style: "currency",
        currency: curr,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${curr}`;
    }
  };

  const getConfidenceColor = (confidence: "high" | "medium" | "low") => {
    switch (confidence) {
      case "high":
        return "text-green-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-red-500";
    }
  };

  const handleScanClick = () => {
    if (!scanAvailability.available) return;
    navigate("/receipts/scan");
  };

  const handleExportReceipts = async () => {
    toast.info(t('receipts.preparingCsv'));
    try {
      await exportAllReceiptsCsv();
      toast.success(t('receipts.csvDownloaded'));
    } catch (error: any) {
      toast.error(error.message || t('receipts.noDataToExport'));
    }
  };

  const handleExportItems = async () => {
    toast.info(t('receipts.preparingCsv'));
    try {
      await exportAllReceiptItemsCsv();
      toast.success(t('receipts.csvDownloaded'));
    } catch (error: any) {
      toast.error(error.message || t('receipts.noDataToExport'));
    }
  };

  const handleExportDiagnostics = async () => {
    const success = await downloadDiagnostics();
    if (success) {
      toast.success(t('receipts.diagnosticsExported'));
    } else {
      toast.info(t('receipts.noDiagnostics'));
    }
  };

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/settings")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-xl font-serif font-medium text-foreground tracking-wide truncate">
              {language === "ru" ? "Чеки" : "Receipts"}
            </h1>
            <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
              {language === "ru" ? "Сканирование и учёт" : "Scan & Track"}
            </p>
          </div>
          {/* Header actions */}
          {receipts && receipts.length > 0 && (
            <div className="flex items-center gap-1">
              {/* Export dropdown */}
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportDiagnostics}>
                    <FileJson className="h-4 w-4 mr-2" />
                    {t('receipts.exportDiagnostics')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Analytics button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/receipts/analytics")}
                className="text-cyber-sigil"
              >
                <TrendingUp className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Rune divider */}
        <div className="mt-4 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        {/* Scan button */}
        {scanAvailability.available ? (
          <Button
            onClick={handleScanClick}
            className="w-full gap-2 h-14 text-lg cyber-btn-primary"
          >
            <ScanLine className="h-5 w-5" />
            {language === "ru" ? "Сканировать чек" : "Scan Receipt"}
          </Button>
        ) : (
          <Card className="panel-glass border-yellow-500/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {language === "ru" ? "Сканирование недоступно" : "Scanning unavailable"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === "ru"
                      ? "Строгая приватность включена. Отключите её в настройках для использования сканера чеков."
                      : "Strict privacy is enabled. Disable it in settings to use the receipt scanner."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Receipts list */}
        {receipts === undefined ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : receipts.length === 0 ? (
          <Card className="panel-glass border-cyber-glow/20">
            <CardContent className="py-12 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {language === "ru" ? "Чеков пока нет" : "No receipts yet"}
              </p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                {language === "ru"
                  ? "Сканируйте чек, чтобы сохранить покупки"
                  : "Scan a receipt to save your purchases"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {receipts.map((receipt) => (
              <Link key={receipt.id} to={`/receipts/${receipt.id}`}>
                <Card className="panel-glass border-cyber-glow/20 hover:border-cyber-sigil/40 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-cyber-sigil flex-shrink-0" />
                          <span className="font-medium truncate">
                            {receipt.storeName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(receipt.date)}
                          </span>
                          <span className={cn("text-xs", getConfidenceColor(receipt.confidence))}>
                            ●
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {formatCurrency(receipt.total, receipt.currency)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReceiptsPage() {
  return (
    <ErrorBoundary>
      <ReceiptsContent />
    </ErrorBoundary>
  );
}
