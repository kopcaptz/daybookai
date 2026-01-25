import { useState, useRef, useEffect } from 'react';
import { Video, Square, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateVideo, generateVideoThumbnail, getSupportedVideoMimeType, formatDuration } from '@/lib/mediaUtils';
import { MEDIA_LIMITS } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VideoCaptureProps {
  onCapture: (blob: Blob, mimeType: string, duration: number, thumbnail?: Blob) => void;
  disabled?: boolean;
}

const DURATION_PRESETS = [10, 30, 60];

export function VideoCapture({ onCapture, disabled }: VideoCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showPresets, setShowPresets] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopRecording();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedVideoMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await processVideo(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      // Timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= selectedDuration) {
            stopRecording();
          }
          return next;
        });
      }, 1000);

      // Auto-stop after selected duration
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, selectedDuration * 1000);
    } catch (error) {
      console.error('Failed to start video recording:', error);
      toast.error('Не удалось запустить камеру');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  };

  const processVideo = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const validation = await validateVideo(blob);

      if (!validation.valid) {
        validation.errors.forEach((err) => toast.error(err));
        return;
      }

      let thumbnail: Blob | undefined;
      try {
        thumbnail = await generateVideoThumbnail(blob);
      } catch {
        console.warn('Failed to generate thumbnail');
      }

      onCapture(blob, blob.type, validation.duration || 0, thumbnail);
      toast.success('Видео добавлено');
    } catch (error) {
      console.error('Video processing failed:', error);
      toast.error('Не удалось обработать видео');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Выберите видео');
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    try {
      const validation = await validateVideo(file);

      if (!validation.valid) {
        validation.errors.forEach((err) => toast.error(err));
        e.target.value = '';
        return;
      }

      let thumbnail: Blob | undefined;
      try {
        thumbnail = await generateVideoThumbnail(file);
      } catch {
        console.warn('Failed to generate thumbnail');
      }

      onCapture(file, file.type, validation.duration || 0, thumbnail);
      toast.success('Видео добавлено');
    } catch (error) {
      console.error('Video processing failed:', error);
      toast.error('Не удалось обработать видео');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isProcessing || isRecording}
      />

      <div className="flex items-center gap-2">
        {isRecording ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={stopRecording}
            className="gap-1.5"
          >
            <Square className="h-4 w-4 fill-current" />
            <span>{formatDuration(recordingTime)}/{formatDuration(selectedDuration)}</span>
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPresets(!showPresets)}
              disabled={disabled || isProcessing}
              className="gap-1.5"
            >
              <Video className="h-4 w-4" />
              <span className="hidden sm:inline">Видео</span>
              <span className="text-xs text-muted-foreground">{selectedDuration}с</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isProcessing}
              title="Выбрать из галереи"
            >
              📁
            </Button>
          </>
        )}
      </div>

      {/* Duration presets dropdown */}
      {showPresets && !isRecording && (
        <div className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg border bg-popover p-2 shadow-lg">
          <p className="mb-1 text-xs text-muted-foreground">Длительность:</p>
          {DURATION_PRESETS.map((duration) => (
            <Button
              key={duration}
              type="button"
              variant={selectedDuration === duration ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setSelectedDuration(duration);
                setShowPresets(false);
                startRecording();
              }}
              className="justify-start"
            >
              <Play className="mr-2 h-3 w-3" />
              {duration} сек
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
