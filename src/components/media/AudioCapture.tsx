import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateAudio, getSupportedAudioMimeType, formatDuration } from '@/lib/mediaUtils';
import { MEDIA_LIMITS } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AudioCaptureProps {
  onCapture: (blob: Blob, mimeType: string, duration: number) => void;
  disabled?: boolean;
}

export function AudioCapture({ onCapture, disabled }: AudioCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      stopRecording();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewBlob(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setPreviewUrl(null);
      setPreviewBlob(null);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= MEDIA_LIMITS.audio.maxDuration) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      console.error('Failed to start audio recording:', error);
      toast.error('Не удалось запустить микрофон');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= MEDIA_LIMITS.audio.maxDuration) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  };

  const handleConfirm = async () => {
    if (!previewBlob) return;

    setIsProcessing(true);
    try {
      // Pass recordingTime as fallback for browsers returning Infinity duration
      const validation = await validateAudio(previewBlob, recordingTime);

      if (!validation.valid) {
        validation.errors.forEach((err) => toast.error(err));
        return;
      }

      onCapture(previewBlob, previewBlob.type, validation.duration || recordingTime);
      toast.success('Аудио добавлено');
      
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
      setRecordingTime(0);
    } catch (error) {
      console.error('Audio processing failed:', error);
      toast.error('Не удалось обработать аудио');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setRecordingTime(0);
  };

  const maxDurationFormatted = formatDuration(MEDIA_LIMITS.audio.maxDuration);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isRecording ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              className="gap-1.5"
            >
              <Square className="h-4 w-4 fill-current" />
              Стоп
            </Button>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={isPaused ? resumeRecording : pauseRecording}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>

            <span className={cn(
              "text-sm font-mono",
              !isPaused && "animate-pulse text-destructive"
            )}>
              🔴 {formatDuration(recordingTime)} / {maxDurationFormatted}
            </span>
          </>
        ) : previewUrl ? (
          <div className="flex items-center gap-2">
            <audio ref={audioRef} src={previewUrl} controls className="h-8 max-w-[200px]" />
            <Button type="button" size="sm" onClick={handleConfirm} disabled={isProcessing}>
              ✓
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              ✕
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={disabled || isProcessing}
            className="gap-1.5"
          >
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Аудио</span>
          </Button>
        )}
      </div>
    </div>
  );
}
