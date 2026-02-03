import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, ImageIcon, Loader2, AlertTriangle, RotateCcw, Zap, Target } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { 
  compressReceiptImage, 
  scanReceipt, 
  isReceiptScanningAvailable, 
  type ReceiptScanResult, 
  type ReceiptScanError,
  type ScanMode,
  SCAN_MODELS 
} from "@/lib/receiptService";
import { logScanAttempt } from "@/lib/scanDiagnostics";
import { trackUsageEvent } from "@/lib/usageTracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

type ScanState = "idle" | "consent" | "processing" | "error";
type ScanStep = "SELECT_IMAGE" | "CONSENT_ACCEPTED" | "COMPRESS_OK" | "API_REQUEST" | "API_RESPONSE_OK" | "API_RESPONSE_ERROR" | "NAVIGATE_REVIEW";

interface ScanError {
  type: "unreadable" | "not_receipt" | "invalid_json" | "validation_error" | "service_error" | "image_too_large" | "unknown";
  hint: string;
  requestId?: string;
}

// Diagnostic logging helper (privacy-safe: no image content)
const logStep = (step: ScanStep, data?: Record<string, unknown>) => {
  console.info(`[ReceiptScan] ${step}`, data || {});
};

function ReceiptScanContent() {
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<ScanError | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number>(0);
  
  // Scan options
  const [scanMode, setScanMode] = useState<ScanMode>("accurate");
  const [preprocessing, setPreprocessing] = useState(true);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Check strictPrivacy and redirect if enabled
  useEffect(() => {
    const availability = isReceiptScanningAvailable();
    if (!availability.available) {
      toast.error(
        language === "ru"
          ? "Сканирование недоступно: включена строгая приватность"
          : "Scanning unavailable: strict privacy is enabled"
      );
      navigate("/receipts");
    }
  }, [navigate, language]);

  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(language === "ru" ? "Выберите изображение" : "Please select an image");
      return;
    }

    logStep("SELECT_IMAGE", { sizeBytes: file.size, type: file.type });

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageBlob(file);
      setOriginalSize(file.size);
      setState("consent");
    } catch (err) {
      console.error("Failed to process image:", err);
      toast.error(language === "ru" ? "Ошибка при загрузке изображения" : "Failed to load image");
    }
  }, [language]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // Reset input
      e.target.value = "";
    },
    [handleFileSelect]
  );

  const handleConsentConfirm = useCallback(async () => {
    if (!imageBlob) return;

    logStep("CONSENT_ACCEPTED");
    setState("processing");
    setError(null);

    const startTime = Date.now();
    let compressedBytes = 0;
    let requestId: string = crypto.randomUUID();
    let httpStatus = 0;
    let errorCode: string | null = null;
    const model = SCAN_MODELS[scanMode];

    try {
      // Compress image with optional preprocessing
      let compressedData: { blob: Blob; base64: string };
      try {
        compressedData = await compressReceiptImage(imageBlob, preprocessing);
        compressedBytes = compressedData.blob.size;
        logStep("COMPRESS_OK", { sizeKB: Math.round(compressedBytes / 1024), preprocessing });
      } catch (err: any) {
        if (err.message === "image_too_large") {
          errorCode = "image_too_large";
          logStep("API_RESPONSE_ERROR", { error: errorCode });
          
          // Log the failed attempt
          await logScanAttempt({
            timestamp: Date.now(),
            originalImageBytes: originalSize,
            compressedBytes: 0,
            model,
            durationMs: Date.now() - startTime,
            httpStatus: 0,
            requestId,
            errorCode,
          });

          setState("error");
          setError({
            type: "image_too_large",
            hint: language === "ru"
              ? "Изображение слишком большое. Попробуйте сфотографировать ближе или с меньшим разрешением."
              : "Image is too large. Try taking a closer photo or with lower resolution.",
          });
          return;
        }
        throw err;
      }

      // Send to API with selected mode
      logStep("API_REQUEST", { requestId: requestId.slice(0, 8), mode: scanMode });
      const result = await scanReceipt(compressedData.base64, language, { mode: scanMode });
      httpStatus = 200; // If we got a response, it was 200

      // Check for error response
      if ("error" in result) {
        const scanError = result as ReceiptScanError;
        errorCode = scanError.error;
        if (scanError.requestId) requestId = scanError.requestId;
        
        logStep("API_RESPONSE_ERROR", { error: errorCode, requestId: requestId.slice(0, 8) });
        
        // Log the failed attempt
        await logScanAttempt({
          timestamp: Date.now(),
          originalImageBytes: originalSize,
          compressedBytes,
          model,
          durationMs: Date.now() - startTime,
          httpStatus,
          requestId,
          errorCode,
        });

        setState("error");
        setError({
          type: scanError.error,
          hint: getErrorHint(scanError.error, language),
          requestId: scanError.requestId,
        });
        return;
      }

      // Success
      logStep("API_RESPONSE_OK", { requestId: requestId.slice(0, 8), mode: scanMode });
      
      // Log successful attempt
      await logScanAttempt({
        timestamp: Date.now(),
        originalImageBytes: originalSize,
        compressedBytes,
        model,
        durationMs: Date.now() - startTime,
        httpStatus,
        requestId,
        errorCode: null,
      });
      
      // Track successful receipt scan
      trackUsageEvent('aiReceiptsScanned');

      logStep("NAVIGATE_REVIEW");
      
      // Navigate to review page with data (include model info)
      navigate("/receipts/review", {
        state: {
          scanResult: result,
          imageBlob: compressedData.blob,
          scanMode,
          model,
        },
      });
    } catch (err) {
      console.error("Scan failed:", err);
      errorCode = "unknown";
      
      // Log the failed attempt
      await logScanAttempt({
        timestamp: Date.now(),
        originalImageBytes: originalSize,
        compressedBytes,
        model,
        durationMs: Date.now() - startTime,
        httpStatus,
        requestId,
        errorCode,
      });

      setState("error");
      setError({
        type: "unknown",
        hint: language === "ru" ? "Произошла ошибка. Попробуйте ещё раз." : "An error occurred. Please try again.",
      });
    }
  }, [imageBlob, originalSize, language, navigate, scanMode, preprocessing]);

  const handleConsentCancel = useCallback(() => {
    setState("idle");
    setImageBlob(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  }, [imagePreview]);

  const handleRetry = useCallback(() => {
    if (imageBlob) {
      setState("consent");
      setError(null);
    } else {
      setState("idle");
    }
  }, [imageBlob]);

  const handleNewPhoto = useCallback(() => {
    setState("idle");
    setError(null);
    setImageBlob(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  }, [imagePreview]);

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
          <h1 className="text-lg font-serif font-medium text-foreground">
            {language === "ru" ? "Сканировать чек" : "Scan Receipt"}
          </h1>
        </div>
      </header>

      <main className="px-4 pt-6 space-y-6">
        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
        />

        {/* Idle state - show capture buttons and options */}
        {state === "idle" && (
          <>
            <Card className="panel-glass border-cyber-glow/20">
              <CardContent className="py-8">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-medium text-lg">
                      {language === "ru" ? "Сфотографируйте чек" : "Take a photo of your receipt"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {language === "ru"
                        ? "Ровно, без бликов, весь текст в кадре"
                        : "Straight, no glare, all text visible"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scan Mode Toggle */}
            <Card className="panel-glass border-border/50">
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t('receipts.scanMode')}</Label>
                  <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
                    <button
                      onClick={() => setScanMode("accurate")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        scanMode === "accurate"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Target className="h-3.5 w-3.5" />
                      {t('receipts.scanAccurate')}
                    </button>
                    <button
                      onClick={() => setScanMode("fast")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        scanMode === "fast"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {t('receipts.scanFast')}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {scanMode === "accurate" ? t('receipts.scanAccurateDesc') : t('receipts.scanFastDesc')}
                </p>
                
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <Label htmlFor="preprocessing" className="text-sm">
                    {t('receipts.preprocessing')}
                  </Label>
                  <Switch
                    id="preprocessing"
                    checked={preprocessing}
                    onCheckedChange={setPreprocessing}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-14 gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-5 w-5" />
                {language === "ru" ? "Камера" : "Camera"}
              </Button>
              <Button
                variant="outline"
                className="h-14 gap-2"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-5 w-5" />
                {language === "ru" ? "Галерея" : "Gallery"}
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              <p>
                {language === "ru"
                  ? "Поддерживаются чеки на русском, английском и иврите"
                  : "Receipts in Russian, English, and Hebrew are supported"}
              </p>
            </div>
          </>
        )}

        {/* Processing state */}
        {state === "processing" && (
          <Card className="panel-glass border-cyber-glow/20">
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                <div>
                  <h2 className="font-medium text-lg">
                    {language === "ru" ? "Распознаём чек..." : "Scanning receipt..."}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {language === "ru"
                      ? "Это может занять несколько секунд"
                      : "This may take a few seconds"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {state === "error" && error && (
          <Card className="panel-glass border-destructive/30">
            <CardContent className="py-8">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <h2 className="font-medium text-lg text-destructive">
                    {getErrorTitle(error.type, language)}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2">{error.hint}</p>
                  {error.requestId && (
                    <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
                      ID: {error.requestId.slice(0, 8)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  {imageBlob && (
                    <Button variant="outline" onClick={handleRetry} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      {language === "ru" ? "Повторить" : "Retry"}
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleNewPhoto}>
                    <Camera className="h-4 w-4 mr-2" />
                    {language === "ru" ? "Новое фото" : "New Photo"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Consent Dialog */}
      <AlertDialog open={state === "consent"} onOpenChange={(open) => !open && handleConsentCancel()}>
        <AlertDialogContent className="panel-glass">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ru" ? "Отправить фото?" : "Send photo?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                {language === "ru"
                  ? "Фото чека будет отправлено для распознавания. Изображение обрабатывается и не сохраняется на сервере."
                  : "The receipt photo will be sent for recognition. The image is processed and not stored on the server."}
              </p>
              {imagePreview && (
                <div className="mt-4 rounded-lg overflow-hidden border border-border/50 max-h-48">
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "ru" ? "Отмена" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConsentConfirm}>
              {language === "ru" ? "Отправить" : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getErrorTitle(type: ScanError["type"], language: string): string {
  const baseLang = (language === 'ru') ? 'ru' : 'en';
  const titles: Record<ScanError["type"], { ru: string; en: string }> = {
    unreadable: { ru: "Не удалось прочитать", en: "Could not read" },
    not_receipt: { ru: "Это не чек", en: "Not a receipt" },
    invalid_json: { ru: "Ошибка распознавания", en: "Recognition error" },
    validation_error: { ru: "Ошибка валидации", en: "Validation error" },
    service_error: { ru: "Ошибка сервиса", en: "Service error" },
    image_too_large: { ru: "Файл слишком большой", en: "File too large" },
    unknown: { ru: "Неизвестная ошибка", en: "Unknown error" },
  };
  return titles[type][baseLang];
}

function getErrorHint(type: ReceiptScanError["error"], language: string): string {
  const baseLang = (language === 'ru') ? 'ru' : 'en';
  const hints: Record<ReceiptScanError["error"], { ru: string; en: string }> = {
    unreadable: {
      ru: "Текст на чеке нечитаем. Попробуйте сфотографировать ровнее и без бликов.",
      en: "Receipt text is unreadable. Try taking a straighter photo without glare.",
    },
    not_receipt: {
      ru: "Изображение не является чеком. Убедитесь, что на фото виден весь чек.",
      en: "Image is not a receipt. Make sure the entire receipt is visible.",
    },
    invalid_json: {
      ru: "Не удалось распознать данные. Попробуйте ещё раз.",
      en: "Failed to parse data. Please try again.",
    },
    validation_error: {
      ru: "Ошибка при проверке данных.",
      en: "Data validation error.",
    },
    service_error: {
      ru: "Сервис временно недоступен. Попробуйте позже.",
      en: "Service temporarily unavailable. Please try later.",
    },
  };
  return hints[type][baseLang];
}

export default function ReceiptScanPage() {
  return (
    <ErrorBoundary>
      <ReceiptScanContent />
    </ErrorBoundary>
  );
}
