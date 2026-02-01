import { useCallback, useMemo, useRef, useState } from "react";

type Phase = "idle" | "holding" | "swiping";

interface UseSecretLongPressSwipeOptions {
  onSecretUnlock: () => void;
  onNormalClick: () => void;
  holdDuration?: number;   // default 3000
  swipeDistance?: number;  // default 100
}

interface GestureState {
  phase: Phase;
  startTime: number;
  startY: number;
  lastY: number;
  pointerId: number | null;
}

export function useSecretLongPressSwipe({
  onSecretUnlock,
  onNormalClick,
  holdDuration = 3000,
  swipeDistance = 100,
}: UseSecretLongPressSwipeOptions) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  const stateRef = useRef<GestureState>({
    phase: "idle",
    startTime: 0,
    startY: 0,
    lastY: 0,
    pointerId: null,
  });

  const targetRef = useRef<HTMLElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const stopTimers = useCallback(() => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) window.clearInterval(progressIntervalRef.current);
    holdTimerRef.current = null;
    progressIntervalRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopTimers();

    const st = stateRef.current;
    if (st.pointerId !== null && targetRef.current) {
      try { targetRef.current.releasePointerCapture(st.pointerId); } catch {}
    }

    stateRef.current = { phase: "idle", startTime: 0, startY: 0, lastY: 0, pointerId: null };
    setProgress(0);
    setPhase("idle");
    targetRef.current = null;
  }, [stopTimers]);

  const handlers = useMemo(() => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();

      const st = stateRef.current;
      targetRef.current = e.currentTarget as HTMLElement;

      st.phase = "holding";
      st.startTime = Date.now();
      st.startY = e.clientY;
      st.lastY = e.clientY;
      st.pointerId = e.pointerId;

      setPhase("holding");

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      // Progress ticks
      progressIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - st.startTime;
        setProgress(Math.min((elapsed / holdDuration) * 100, 100));
      }, 50);

      // Hold complete -> switch to swiping + freeze progress interval
      holdTimerRef.current = window.setTimeout(() => {
        stopTimers();
        setProgress(100);

        // Key fix: startY is set to lastY to prevent counting micro-movements during hold
        st.phase = "swiping";
        st.startY = st.lastY;

        setPhase("swiping");
        navigator.vibrate?.(15);
      }, holdDuration);
    },

    onPointerMove: (e: React.PointerEvent) => {
      const st = stateRef.current;
      st.lastY = e.clientY;

      if (st.phase !== "swiping") return;

      const delta = e.clientY - st.startY;
      if (delta >= swipeDistance) {
        cleanup();
        navigator.vibrate?.([20, 50, 20]);
        onSecretUnlock();
      }
    },

    onPointerUp: () => {
      const st = stateRef.current;

      if (st.phase === "holding") {
        // Didn't wait for hold -> normal click
        cleanup();
        onNormalClick();
        return;
      }

      if (st.phase === "swiping") {
        // Waited for hold but didn't swipe -> nothing
        cleanup();
      }
    },

    onPointerCancel: () => cleanup(),

    onLostPointerCapture: () => cleanup(),
  }), [cleanup, holdDuration, onNormalClick, onSecretUnlock, stopTimers, swipeDistance]);

  return { handlers, progress, phase };
}
