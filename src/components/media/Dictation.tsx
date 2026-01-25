import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSpeechRecognitionSupported } from '@/lib/mediaUtils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DictationProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function Dictation({ onTranscript, disabled }: DictationProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  // Store callback in ref to avoid re-creating recognition on every parent render
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  
  // Some browsers return cumulative final transcripts (e.g. "Привет" then "Привет у меня ...").
  // Track per-result index transcript + emitted cumulative text to avoid duplication.
  const lastFinalByIndexRef = useRef<Map<number, string>>(new Map());
  const lastEmittedFinalRef = useRef<string>('');

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

  useEffect(() => {
    setIsSupported(isSpeechRecognitionSupported());
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error('Распознавание речи не поддерживается вашим браузером');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = 'ru-RU';
      recognition.continuous = true;
      recognition.interimResults = true;
      
      // Reset trackers on start
      lastFinalByIndexRef.current = new Map();
      lastEmittedFinalRef.current = '';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        const finals: string[] = [];

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const normalized = normalize(transcript);
            const prev = lastFinalByIndexRef.current.get(i);
            // Ignore exact repeats for the same result index
            if (prev === normalized) continue;
            lastFinalByIndexRef.current.set(i, normalized);
            if (normalized) finals.push(normalized);
          } else {
            interim += transcript;
          }
        }

        if (finals.length > 0) {
          // Combine finals from this event
          const combinedFinal = normalize(finals.join(' '));
          const lastEmitted = lastEmittedFinalRef.current;

          // If browser returns cumulative text, emit only the delta.
          let toEmit = combinedFinal;
          if (lastEmitted && combinedFinal.startsWith(lastEmitted)) {
            toEmit = normalize(combinedFinal.slice(lastEmitted.length));
          } else if (lastEmitted && lastEmitted.startsWith(combinedFinal)) {
            // Older (shorter) snapshot – ignore
            toEmit = '';
          }

          // Update the cumulative snapshot (always use the combined final)
          lastEmittedFinalRef.current = combinedFinal;

          if (toEmit) {
            onTranscriptRef.current(toEmit);
          }
          setInterimText('');
        } else {
          setInterimText(interim);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'not-allowed') {
          toast.error('Доступ к микрофону запрещён');
        } else if (event.error === 'no-speech') {
          toast.info('Речь не распознана');
        } else if (event.error === 'network') {
          toast.error('Ошибка сети. Распознавание речи требует интернет-соединения');
        } else {
          toast.error(`Ошибка распознавания: ${event.error}`);
        }
        
        setIsListening(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      toast.error('Не удалось запустить распознавание речи');
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
    lastFinalByIndexRef.current = new Map();
    lastEmittedFinalRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  if (!isSupported) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        className="gap-1.5 opacity-50"
        title="Распознавание речи не поддерживается"
      >
        <MicOff className="h-4 w-4" />
        <span className="hidden sm:inline">Диктовка</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isListening ? 'destructive' : 'outline'}
        size="sm"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        className={cn('gap-1.5', isListening && 'animate-pulse')}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">
          {isListening ? 'Остановить' : 'Диктовка'}
        </span>
      </Button>

      {isListening && interimText && (
        <span className="max-w-[150px] truncate text-xs italic text-muted-foreground">
          {interimText}...
        </span>
      )}
    </div>
  );
}
