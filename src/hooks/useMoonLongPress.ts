import { useState, useRef, useCallback, useMemo } from 'react';

interface UseMoonLongPressOptions {
  onSuccess: () => void;
  duration?: number; // ms
}

export function useMoonLongPress({ onSuccess, duration = 3000 }: UseMoonLongPressOptions) {
  const [progress, setProgress] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPressed(false);
    setProgress(0);
  }, []);

  const handlers = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        setIsPressed(true);
        startTimeRef.current = Date.now();
        setProgress(0);

        // Update progress every 50ms
        intervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current;
          const pct = Math.min((elapsed / duration) * 100, 100);
          setProgress(pct);
        }, 50);

        // Success after duration
        timerRef.current = setTimeout(() => {
          cleanup();
          // Subtle haptic feedback
          navigator.vibrate?.([20, 50, 20]);
          onSuccess();
        }, duration);
      },

      onPointerUp: () => {
        cleanup();
      },

      onPointerLeave: () => {
        cleanup();
      },

      onPointerCancel: () => {
        cleanup();
      },
    }),
    [onSuccess, duration, cleanup]
  );

  return { handlers, progress, isPressed };
}
