import { useState, useEffect, useMemo } from 'react';
import { Image, Video, Mic, Play, X, Loader2, Copy, FileText, RotateCcw } from 'lucide-react';
import { Attachment, AudioTranscript } from '@/lib/db';
import { formatFileSize, formatDuration } from '@/lib/mediaUtils';
import { getCachedInsight, ImageAnalysisResult } from '@/lib/imageAnalysisService';
import { getCachedTranscript, requestTranscription, clearTranscript } from '@/lib/audioTranscriptionService';
import { ImageAnalysisButton, ImageAnalysisResultDisplay } from './ImageAnalysisButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PRIVACY_ACCEPTED_KEY = 'audio-transcribe-privacy-accepted';

interface EntryAttachmentViewerProps {
  attachments: Attachment[];
  className?: string;
  onInsertText?: (text: string) => void;
}

export function EntryAttachmentViewer({ attachments, className, onInsertText }: EntryAttachmentViewerProps) {
  const { t } = useI18n();
  
  if (attachments.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-muted-foreground">
        {t('media.photo')} / {t('media.audio')} ({attachments.length})
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attachments.map((attachment) => (
          <AttachmentCard 
            key={attachment.id} 
            attachment={attachment} 
            onInsertText={onInsertText}
          />
        ))}
      </div>
    </div>
  );
}

interface AttachmentCardProps {
  attachment: Attachment;
  onInsertText?: (text: string) => void;
}

function AttachmentCard({ attachment, onInsertText }: AttachmentCardProps) {
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

              {/* Transcription section for audio only */}
              {attachment.kind === 'audio' && attachment.id && (
                <TranscribeSection
                  attachmentId={attachment.id}
                  blob={attachment.blob}
                  onInsertText={onInsertText}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Transcription section component
interface TranscribeSectionProps {
  attachmentId: number;
  blob: Blob;
  onInsertText?: (text: string) => void;
}

function TranscribeSection({ attachmentId, blob, onInsertText }: TranscribeSectionProps) {
  const { t, language } = useI18n();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [transcript, setTranscript] = useState<AudioTranscript | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);

  // Load cached transcript on mount
  useEffect(() => {
    getCachedTranscript(attachmentId).then(cached => {
      if (cached) {
        setTranscript(cached);
        setState(cached.status);
        if (cached.errorCode) setErrorCode(cached.errorCode);
      }
    });
  }, [attachmentId]);

  const handleTranscribe = async () => {
    // Check privacy consent first
    if (!localStorage.getItem(PRIVACY_ACCEPTED_KEY)) {
      setShowPrivacyDialog(true);
      return;
    }
    
    await doTranscribe();
  };

  const doTranscribe = async () => {
    setState('pending');
    setErrorCode(null);
    
    const result = await requestTranscription(attachmentId, blob, { 
      languageHint: language 
    });
    
    if (result.ok) {
      // Reload from cache to get full transcript object
      const cached = await getCachedTranscript(attachmentId);
      if (cached) {
        setTranscript(cached);
        setState('done');
      }
    } else {
      // result.ok is false, so errorCode exists
      const error = result as { ok: false; errorCode: string };
      setErrorCode(error.errorCode);
      setState('error');
    }
  };

  const handlePrivacyAccept = () => {
    localStorage.setItem(PRIVACY_ACCEPTED_KEY, 'true');
    setShowPrivacyDialog(false);
    doTranscribe();
  };

  const handleRetry = async () => {
    // Clear the error state and retry
    await clearTranscript(attachmentId);
    setTranscript(null);
    await doTranscribe();
  };

  const handleCopy = () => {
    if (transcript?.text) {
      navigator.clipboard.writeText(transcript.text);
      toast.success(t('audio.copied'));
    }
  };

  const handleInsert = () => {
    if (transcript?.text && onInsertText) {
      onInsertText(transcript.text);
    }
  };

  const getErrorMessage = (code: string): string => {
    switch (code) {
      case 'too_large':
        return t('audio.tooLarge');
      case 'unsupported_format':
        return t('audio.unsupportedFormat');
      case 'auth_required':
        return t('audio.authRequired');
      case 'rate_limited':
        return t('audio.rateLimited');
      case 'pending':
        return t('audio.transcribing');
      default:
        return t('audio.transcriptionFailed');
    }
  };

  return (
    <>
      <div className="space-y-3 border-t border-border/50 pt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{t('audio.transcribe')}</span>
        </div>

        {/* Idle state - show transcribe button */}
        {state === 'idle' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTranscribe}
            className="w-full"
          >
            <FileText className="h-4 w-4 mr-2" />
            {t('audio.transcribe')}
          </Button>
        )}

        {/* Pending state - show loader */}
        {state === 'pending' && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('audio.transcribing')}</span>
          </div>
        )}

        {/* Done state - show transcript */}
        {state === 'done' && transcript?.text && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {transcript.text}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex-1"
              >
                <Copy className="h-4 w-4 mr-2" />
                {t('audio.copy')}
              </Button>
              {onInsertText && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInsert}
                  className="flex-1"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {t('audio.insert')}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && errorCode && (
          <div className="space-y-3">
            <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
              {getErrorMessage(errorCode)}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="w-full"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('common.retry')}
            </Button>
          </div>
        )}
      </div>

      {/* Privacy consent dialog */}
      <AlertDialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('audio.privacyTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('audio.privacyWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handlePrivacyAccept}>
              {t('common.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
