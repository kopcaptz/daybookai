import { useState, useEffect, useMemo } from 'react';
import { Image, Video, Mic, Play, X } from 'lucide-react';
import { Attachment } from '@/lib/db';
import { formatFileSize, formatDuration } from '@/lib/mediaUtils';
import { getCachedInsight, ImageAnalysisResult } from '@/lib/imageAnalysisService';
import { ImageAnalysisButton, ImageAnalysisResultDisplay } from './ImageAnalysisButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface EntryAttachmentViewerProps {
  attachments: Attachment[];
  className?: string;
}

export function EntryAttachmentViewer({ attachments, className }: EntryAttachmentViewerProps) {
  const { t } = useI18n();
  
  if (attachments.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-muted-foreground">
        {t('media.photo')} / {t('media.audio')} ({attachments.length})
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attachments.map((attachment) => (
          <AttachmentCard key={attachment.id} attachment={attachment} />
        ))}
      </div>
    </div>
  );
}

interface AttachmentCardProps {
  attachment: Attachment;
}

function AttachmentCard({ attachment }: AttachmentCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  
  const previewUrl = useMemo(() => {
    if (attachment.kind === 'image') {
      return URL.createObjectURL(attachment.blob);
    }
    if (attachment.kind === 'video' && attachment.thumbnail) {
      return URL.createObjectURL(attachment.thumbnail);
    }
    return null;
  }, [attachment]);

  // Load cached analysis on mount
  useEffect(() => {
    if (attachment.kind === 'image' && attachment.id) {
      getCachedInsight(attachment.id).then(setAnalysisResult);
    }
  }, [attachment.id, attachment.kind]);

  const getIcon = () => {
    switch (attachment.kind) {
      case 'image':
        return <Image className="h-6 w-6" />;
      case 'video':
        return <Video className="h-6 w-6" />;
      case 'audio':
        return <Mic className="h-6 w-6" />;
    }
  };

  const getLabel = () => {
    const size = formatFileSize(attachment.size);
    if (attachment.duration) {
      return `${size} • ${formatDuration(attachment.duration)}`;
    }
    return size;
  };

  return (
    <>
      <div 
        className="group relative overflow-hidden rounded-lg border border-border/50 bg-card cursor-pointer hover:border-cyber-glow/30 transition-colors"
        onClick={() => setIsOpen(true)}
      >
        {previewUrl ? (
          <div className="relative aspect-square">
            <img
              src={previewUrl}
              alt="Attachment"
              className="h-full w-full object-cover"
            />
            {attachment.kind === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-8 w-8 text-white" fill="white" />
              </div>
            )}
            {/* Analysis indicator */}
            {analysisResult && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyber-sigil animate-pulse" />
            )}
          </div>
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
            {getIcon()}
            <span className="text-center text-xs leading-tight">{getLabel()}</span>
          </div>
        )}

        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
          <p className="text-[10px] text-white/90">{getLabel()}</p>
        </div>
      </div>

      {/* Full view dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden panel-glass">
          <DialogTitle className="sr-only">Attachment preview</DialogTitle>
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="space-y-4">
            {/* Media display */}
            {attachment.kind === 'image' && previewUrl && (
              <img
                src={previewUrl}
                alt="Full size"
                className="w-full max-h-[60vh] object-contain bg-black/50"
              />
            )}
            
            {attachment.kind === 'video' && (
              <video
                src={URL.createObjectURL(attachment.blob)}
                controls
                className="w-full max-h-[60vh] bg-black"
              />
            )}
            
            {attachment.kind === 'audio' && (
              <div className="p-8 flex flex-col items-center gap-4">
                <Mic className="h-12 w-12 text-muted-foreground" />
                <audio
                  src={URL.createObjectURL(attachment.blob)}
                  controls
                  className="w-full"
                />
              </div>
            )}

            {/* Actions and Analysis */}
            <div className="p-4 space-y-3">
              {/* Analysis button for images only */}
              {attachment.kind === 'image' && attachment.id && (
                <ImageAnalysisButton
                  attachmentId={attachment.id}
                  imageBlob={attachment.blob}
                  onAnalysisComplete={setAnalysisResult}
                />
              )}
              
              {/* Analysis result display */}
              {analysisResult && (
                <ImageAnalysisResultDisplay result={analysisResult} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
