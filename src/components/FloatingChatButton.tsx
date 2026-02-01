import { useState, useEffect, useCallback, useRef } from 'react';
import { ScanEye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAutoScreenshot } from '@/hooks/useAutoScreenshot';
import { loadAISettings } from '@/lib/aiConfig';

interface FloatingChatButtonProps {
  className?: string;
}

export function FloatingChatButton({ className }: FloatingChatButtonProps) {
  const { t, language } = useI18n();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  
  // Iframe ref for postMessage communication
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Auto-screenshot hook
  const { isCapturing, captureAndSend, isEnabled: isAutoScreenshotEnabled } = useAutoScreenshot({
    language,
    iframeRef,
  });

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOpen = useCallback(async () => {
    setIsAnimating(true);
    setIsOpen(true);
    
    // Haptic feedback on mobile
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    // Reset animation state after transition
    setTimeout(() => setIsAnimating(false), 400);
    
    // Auto-screenshot after sheet opens and iframe loads
    // This is handled after iframe loads in handleIframeLoad
  }, []);
  
  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setIframeError(false);
    
    // Trigger auto-screenshot after iframe is ready
    const settings = loadAISettings();
    if (settings.autoScreenshot) {
      // Small delay to ensure iframe is fully interactive
      setTimeout(() => {
        captureAndSend();
      }, 300);
    }
  }, [captureAndSend]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIframeLoaded(false);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeError(true);
    setIframeLoaded(false);
  }, []);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpen}
        className={cn(
          // Position & Layout
          "fixed z-50",
          isMobile ? "bottom-20 right-4" : "bottom-6 right-6",
          // Size
          "h-14 w-14",
          // Shape & Style
          "rounded-full",
          "bg-gradient-to-br from-primary via-primary to-accent",
          "border border-glow-primary/30",
          // Effects
          "shadow-lg",
          "transition-all duration-300 ease-out",
          "hover:scale-110 hover:shadow-xl",
          "active:scale-95",
          // Focus
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          // Animation
          "animate-pulse-glow",
          // Flex
          "flex items-center justify-center",
          // State
          isOpen && "scale-0 opacity-0",
          className
        )}
        aria-label={language === 'ru' ? 'Открыть чат' : 'Open chat'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {/* Glow accent */}
        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-glow-primary/20 blur-sm" />
        
        {/* Pulsing ring */}
        <div className="absolute inset-0 rounded-full border-2 border-glow-primary/20 animate-ping opacity-75" 
             style={{ animationDuration: '2s' }} />
        
        <ScanEye className="h-6 w-6 text-primary-foreground relative z-10" strokeWidth={2} />
      </button>

      {/* Chat Sheet Modal */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side={isMobile ? "bottom" : "right"}
          className={cn(
            // Animation
            "transition-all duration-400 ease-out",
            isAnimating && "animate-slide-in",
            // Size
            isMobile 
              ? "h-[85vh] rounded-t-2xl" 
              : "w-[420px] max-w-[90vw] h-full",
            // Style
            "p-0 gap-0",
            "bg-background/95 backdrop-blur-xl",
            "border-l border-t border-glow-primary/20"
          )}
          aria-describedby="chat-description"
        >
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <ScanEye className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <div>
                <SheetTitle className="text-base font-medium">
                  {language === 'ru' ? 'Чат' : 'Chat'}
                </SheetTitle>
                <SheetDescription id="chat-description" className="text-xs text-muted-foreground">
                  {language === 'ru' ? 'AI-ассистент' : 'AI Assistant'}
                </SheetDescription>
              </div>
            </div>
            
            <button
              onClick={handleClose}
              className={cn(
                "h-8 w-8 rounded-full",
                "bg-muted/50 hover:bg-muted",
                "flex items-center justify-center",
                "transition-colors duration-200",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
              aria-label={language === 'ru' ? 'Закрыть чат' : 'Close chat'}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </SheetHeader>

          {/* Chat Content */}
          <div className="flex-1 h-[calc(100%-56px)] relative">
            {/* Loading state */}
            {!iframeLoaded && !iframeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">
                    {language === 'ru' ? 'Загрузка...' : 'Loading...'}
                  </span>
                </div>
              </div>
            )}

            {/* Error state */}
            {iframeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background p-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <X className="h-6 w-6 text-destructive" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ru' 
                      ? 'Не удалось загрузить чат. Попробуйте позже.' 
                      : 'Failed to load chat. Please try again later.'}
                  </p>
                  <button
                    onClick={() => {
                      setIframeError(false);
                      setIframeLoaded(false);
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    {language === 'ru' ? 'Повторить' : 'Retry'}
                  </button>
                </div>
              </div>
            )}

            {/* Chat iframe */}
            <iframe
              ref={iframeRef}
              src="/chat"
              className={cn(
                "w-full h-full border-0",
                "transition-opacity duration-300",
                iframeLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={language === 'ru' ? 'Чат' : 'Chat'}
              allow="microphone"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
