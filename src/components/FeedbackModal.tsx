import { useState, useRef } from 'react';
import { X, Paperclip, Send, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GrimoireIcon } from '@/components/icons/SigilIcon';
import { APP_VERSION, BUILD_TIMESTAMP } from '@/lib/appVersion';
import { getExtendedDeviceInfo } from '@/lib/deviceInfo';
import { getScanStats } from '@/lib/scanDiagnostics';
import { loadAISettings } from '@/lib/aiConfig';
import { trackUsageEvent } from '@/lib/usageTracker';
import { useSecretLongPressSwipe } from '@/hooks/useSecretLongPressSwipe';
import { useI18n } from '@/lib/i18n';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

interface FeedbackModalProps {
  onSecretUnlock?: () => void;
}

export function FeedbackModal({ onSecretUnlock }: FeedbackModalProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handlers, progress, phase } = useSecretLongPressSwipe({
    onSecretUnlock: () => onSecretUnlock?.(),
    onNormalClick: () => setOpen(true),
    holdDuration: 3000,
    swipeDistance: 100,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size
      if (file.size > MAX_IMAGE_SIZE) {
        toast({
          title: t('feedback.fileTooLargeTitle'),
          description: t('feedback.fileTooLargeDesc'),
          variant: "destructive",
        });
        return;
      }
      // Clean up previous preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Collect extended device info
      const deviceInfo = await getExtendedDeviceInfo();
      
      // Get AI settings
      const aiSettings = loadAISettings();
      
      // Get scan statistics
      const scanStats = await getScanStats();
      
      // Build diagnostics object
      const diagnostics = {
        aiSettings: {
          enabled: aiSettings.enabled,
          autoMood: aiSettings.autoMood,
          autoTags: aiSettings.autoTags,
          autoScreenshot: aiSettings.autoScreenshot,
          chatProfile: aiSettings.chatProfile,
        },
        scanStats,
      };

      // Create form data
      const formData = new FormData();
      formData.append('message', message.trim());
      formData.append('device_info', JSON.stringify(deviceInfo));
      formData.append('app_version', APP_VERSION);
      formData.append('build_timestamp', BUILD_TIMESTAMP);
      formData.append('diagnostics', JSON.stringify(diagnostics));
      
      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      // Submit via direct fetch (supabase.functions.invoke doesn't handle FormData correctly)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback-submit`,
        {
          method: 'POST',
          body: formData,
          // Important: do NOT set Content-Type, browser adds multipart/form-data with boundary
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unknown error');
      }

      // Track feedback submission
      trackUsageEvent('feedbackSubmitted');

      toast({
        title: t('feedback.successTitle'),
        description: t('feedback.successDesc'),
      });

      // Reset form
      setMessage('');
      handleRemoveFile();
      setOpen(false);
    } catch (error) {
      console.error('Feedback submit error:', error);
      toast({
        title: t('feedback.errorTitle'),
        description: t('feedback.errorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Clean up on close
      setMessage('');
      handleRemoveFile();
    }
  };

  // SVG progress ring calculation
  const circumference = 2 * Math.PI * 14;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Button with secret gesture - no DialogTrigger, manual control */}
      <button
        {...handlers}
        className={cn(
          "fixed top-4 start-4 z-50",
          "p-2 rounded-lg",
          "bg-card/80 backdrop-blur-sm",
          "border border-border/50",
          "text-cyber-sigil",
          "transition-all duration-300",
          "hover:border-cyber-sigil/50",
          "hover:shadow-[0_0_15px_hsl(var(--sigil)/0.3)]",
          "focus:outline-none focus:ring-2 focus:ring-cyber-sigil/50",
          "group touch-none select-none",
          phase !== 'idle' && "scale-110"
        )}
        aria-label={t('feedback.title')}
      >
        <div className="relative">
          <GrimoireIcon className="h-6 w-6" />
          <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-cyber-glow opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {/* Progress ring during hold */}
          {phase !== 'idle' && (
            <svg 
              className="absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90 pointer-events-none"
              viewBox="0 0 32 32"
            >
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-primary/20"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="text-primary transition-all duration-100"
              />
            </svg>
          )}
        </div>
        
        {/* Swipe hint after hold complete */}
        {phase === 'swiping' && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-primary animate-bounce">
            <ChevronDown className="h-4 w-4" />
          </div>
        )}
      </button>

      <DialogContent 
        className={cn(
          "sm:max-w-md",
          "bg-card/95 backdrop-blur-xl",
          "border border-violet-500/30",
          "shadow-[0_0_30px_rgba(139,92,246,0.15)]"
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-serif text-foreground flex items-center gap-2">
            <span className="text-cyber-sigil">◆</span>
            {t('feedback.title')}
            <span className="text-cyber-sigil">◆</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Message textarea */}
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('feedback.placeholder')}
            className={cn(
              "min-h-[120px] resize-none",
              "bg-background/50 border-border/50",
              "focus:border-cyber-sigil/50 focus:ring-cyber-sigil/20",
              "placeholder:text-muted-foreground/50",
              // Custom scrollbar
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border",
              "hover:scrollbar-thumb-muted-foreground/30"
            )}
          />

          {/* File attachment */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              id="artifact-upload"
            />
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "gap-2 text-sm",
                "border-dashed border-border/70",
                "hover:border-cyber-sigil/50 hover:text-cyber-sigil",
              "transition-colors"
            )}
          >
            <Paperclip className="h-4 w-4" />
            {t('feedback.attachArtifact')}
          </Button>

          {/* File preview */}
            {previewUrl && selectedFile && (
              <div className="relative inline-block">
                <div className={cn(
                  "relative w-20 h-20 rounded-lg overflow-hidden",
                  "border border-border/50",
                  "bg-background/30"
                )}>
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className={cn(
                    "absolute -top-2 -right-2",
                    "w-5 h-5 rounded-full",
                    "bg-destructive text-destructive-foreground",
                    "flex items-center justify-center",
                    "hover:bg-destructive/80",
                    "transition-colors",
                    "shadow-sm"
                  )}
                  aria-label={t('feedback.removeFile')}
                >
                  <X className="h-3 w-3" />
                </button>
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-[80px]">
                  {selectedFile.name}
                </p>
              </div>
            )}
          </div>

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || isSubmitting}
            className={cn(
              "w-full gap-2",
              "bg-gradient-to-r from-violet-600 to-indigo-600",
              "hover:from-violet-500 hover:to-indigo-500",
              "text-white font-medium",
              "shadow-[0_0_20px_rgba(139,92,246,0.25)]",
              "hover:shadow-[0_0_25px_rgba(139,92,246,0.4)]",
              "transition-all duration-300",
              "disabled:opacity-50 disabled:shadow-none"
            )}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSubmitting ? t('feedback.submitting') : t('feedback.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
