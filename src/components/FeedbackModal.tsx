import { useState, useRef } from 'react';
import { X, Paperclip, Send, Sparkles, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { GrimoireIcon } from '@/components/icons/SigilIcon';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size
      if (file.size > MAX_IMAGE_SIZE) {
        toast({
          title: "Файл слишком большой",
          description: "Максимальный размер изображения — 5 МБ",
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
      // Collect device info
      const deviceInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        timestamp: new Date().toISOString(),
      };

      // Create form data
      const formData = new FormData();
      formData.append('message', message.trim());
      formData.append('device_info', JSON.stringify(deviceInfo));
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

      toast({
        title: "Сообщение отправлено в архив",
        description: "Мастер получит ваше послание",
      });

      // Reset form
      setMessage('');
      handleRemoveFile();
      setOpen(false);
    } catch (error) {
      console.error('Feedback submit error:', error);
      toast({
        title: "Ошибка отправки",
        description: "Не удалось отправить сообщение. Попробуйте позже.",
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "fixed top-4 left-4 z-50",
            "p-2 rounded-lg",
            "bg-card/80 backdrop-blur-sm",
            "border border-border/50",
            "text-cyber-sigil",
            "transition-all duration-300",
            "hover:border-cyber-sigil/50",
            "hover:shadow-[0_0_15px_hsl(var(--sigil)/0.3)]",
            "focus:outline-none focus:ring-2 focus:ring-cyber-sigil/50",
            "group"
          )}
          aria-label="Связь с Мастером"
        >
          <div className="relative">
            <GrimoireIcon className="h-6 w-6" />
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-cyber-glow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </DialogTrigger>

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
            Связь с Мастером
            <span className="text-cyber-sigil">◆</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Message textarea */}
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Изложите вашу мысль..."
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
              Прикрепить артефакт
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
                  aria-label="Удалить файл"
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
            {isSubmitting ? "Отправка..." : "Отправить в эфир"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
