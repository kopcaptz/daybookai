import { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { analyzeImage, getCachedInsight, ImageAnalysisResult } from '@/lib/imageAnalysisService';
import { loadAISettings } from '@/lib/aiConfig';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ImageAnalysisButtonProps {
  attachmentId: number;
  imageBlob: Blob;
  onAnalysisComplete?: (result: ImageAnalysisResult) => void;
  className?: string;
}

export function ImageAnalysisButton({
  attachmentId,
  imageBlob,
  onAnalysisComplete,
  className,
}: ImageAnalysisButtonProps) {
  const { t, language } = useI18n();
  const [showConsent, setShowConsent] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cachedResult, setCachedResult] = useState<ImageAnalysisResult | null>(null);
  
  const settings = loadAISettings();
  const isStrictPrivacy = settings.strictPrivacy;
  const isAIEnabled = settings.enabled;

  // Check for cached result on mount
  useEffect(() => {
    getCachedInsight(attachmentId).then(setCachedResult);
  }, [attachmentId]);

  const handleAnalyzeClick = () => {
    if (!isAIEnabled) {
      toast.error(t('ai.chatDisabled'));
      return;
    }
    
    if (isStrictPrivacy) {
      toast.info(t('privacy.strictBlocksMedia'));
      return;
    }
    
    // If we have cached result, just show it
    if (cachedResult) {
      onAnalysisComplete?.(cachedResult);
      return;
    }
    
    setShowConsent(true);
  };

  const handleConfirmAnalysis = async () => {
    setShowConsent(false);
    setIsAnalyzing(true);
    
    await analyzeImage(imageBlob, attachmentId, language, {
      onStart: () => setIsAnalyzing(true),
      onComplete: (result) => {
        setIsAnalyzing(false);
        setCachedResult(result);
        onAnalysisComplete?.(result);
      },
      onError: (error) => {
        setIsAnalyzing(false);
        toast.error(`${t('media.analysisError')}: ${error.message}`);
      },
    });
  };

  // Don't show button if AI is disabled
  if (!isAIEnabled) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAnalyzeClick}
        disabled={isAnalyzing || isStrictPrivacy}
        className={cn(
          'gap-1.5 text-xs',
          cachedResult && 'text-cyber-sigil border-cyber-sigil/30',
          className
        )}
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('media.analyzing')}
          </>
        ) : isStrictPrivacy ? (
          <>
            <AlertCircle className="h-3 w-3" />
            {t('media.analyze')}
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3" />
            {cachedResult ? t('media.analysisTitle') : t('media.analyze')}
          </>
        )}
      </Button>

      {/* Consent Dialog */}
      <AlertDialog open={showConsent} onOpenChange={setShowConsent}>
        <AlertDialogContent className="panel-glass">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyber-sigil" />
              {t('media.analyze')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('consent.photoAnalysis')}</p>
              <p className="text-xs text-muted-foreground/80">
                {t('consent.photoAnalysisHint')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAnalysis} className="btn-cyber">
              {t('consent.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ImageAnalysisResultDisplayProps {
  result: ImageAnalysisResult;
  className?: string;
}

export function ImageAnalysisResultDisplay({ result, className }: ImageAnalysisResultDisplayProps) {
  const { t } = useI18n();
  
  return (
    <div className={cn('panel-glass p-3 space-y-2', className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-cyber-sigil">
        <Sparkles className="h-3 w-3" />
        {t('media.analysisTitle')}
      </div>
      
      {result.description && (
        <p className="text-sm text-foreground/90">{result.description}</p>
      )}
      
      {result.emotions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.emotions.map((emotion, i) => (
            <span
              key={i}
              className="inline-flex rounded-full bg-accent/20 border border-accent/30 px-2 py-0.5 text-xs text-accent-foreground"
            >
              {emotion}
            </span>
          ))}
        </div>
      )}
      
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.tags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex rounded-full bg-secondary/50 border border-border/30 px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {result.reflection && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-cyber-sigil/30 pl-2">
          {result.reflection}
        </p>
      )}
    </div>
  );
}
