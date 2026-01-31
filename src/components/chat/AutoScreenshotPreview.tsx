/**
 * AutoScreenshotPreview Component
 * Shows a preview of auto-captured screenshot with send/edit/cancel actions
 */

import { useState, useEffect } from 'react';
import { X, Send, Pencil, Image as ImageIcon, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AutoScreenshotPayload } from '@/lib/screenshotService';

interface AutoScreenshotPreviewProps {
  payload: AutoScreenshotPayload;
  onSend: (prompt: string, imageUrl: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
  language?: 'ru' | 'en';
}

// Auto-dismiss timeout (5 minutes)
const AUTO_DISMISS_TIMEOUT = 5 * 60 * 1000;

export function AutoScreenshotPreview({
  payload,
  onSend,
  onDismiss,
  isLoading = false,
  language = 'ru',
}: AutoScreenshotPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState(payload.prompt);
  
  // Auto-dismiss after timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_TIMEOUT);
    
    return () => clearTimeout(timer);
  }, [onDismiss]);
  
  const handleSend = () => {
    onSend(prompt.trim() || payload.prompt, payload.base64DataUrl);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isEditing) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      if (isEditing) {
        setIsEditing(false);
        setPrompt(payload.prompt);
      } else {
        onDismiss();
      }
    }
  };
  
  const labels = {
    title: language === 'ru' ? 'Превью скриншота' : 'Screenshot preview',
    send: language === 'ru' ? 'Отправить' : 'Send',
    edit: language === 'ru' ? 'Редактировать' : 'Edit',
    cancel: language === 'ru' ? 'Отмена' : 'Cancel',
    from: language === 'ru' ? 'Страница' : 'From',
    privacyNote: language === 'ru' 
      ? 'Приватные поля размыты' 
      : 'Private fields are blurred',
  };
  
  return (
    <div 
      className={cn(
        "p-4 border-b border-border/50",
        "bg-gradient-to-br from-cyber-glow/5 to-transparent",
        "animate-fade-in"
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-cyber-sigil" />
          <span className="text-sm font-medium">{labels.title}</span>
          <span className="text-xs text-muted-foreground">
            ({labels.from}: {payload.route})
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center"
          aria-label={labels.cancel}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      
      {/* Image Preview */}
      <div className="relative mb-3 rounded-lg overflow-hidden border border-border/30 bg-muted/30">
        <img
          src={payload.base64DataUrl}
          alt="Screenshot preview"
          className="w-full max-h-40 object-contain"
        />
        {/* Privacy indicator */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          {labels.privacyNote}
        </div>
      </div>
      
      {/* Prompt */}
      {isEditing ? (
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={payload.prompt}
          className="mb-3 min-h-[60px] resize-none"
          autoFocus
        />
      ) : (
        <div 
          className="mb-3 p-2 rounded bg-muted/30 text-sm text-foreground cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsEditing(true)}
        >
          {prompt}
        </div>
      )}
      
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          disabled={isLoading}
          className="text-muted-foreground"
        >
          {labels.cancel}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
          disabled={isLoading}
          className="gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          {labels.edit}
        </Button>
        
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isLoading}
          className="gap-1.5 ml-auto btn-cyber"
        >
          {isLoading ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {labels.send}
        </Button>
      </div>
    </div>
  );
}
