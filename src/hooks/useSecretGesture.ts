import React, { useState, useRef, useCallback, useMemo } from 'react';

interface UseSecretGestureOptions {
  onSuccess: () => void;
}

interface GestureState {
  phase: 'idle' | 'tapping' | 'holding' | 'swiping';
  tapCount: number;
  tapStartTime: number;
  holdStartTime: number;
  swipeStartY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  capturedPointerId: number | null;
}

export function useSecretGesture({ onSuccess }: UseSecretGestureOptions) {
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const stateRef = useRef<GestureState>({
    phase: 'idle',
    tapCount: 0,
    tapStartTime: 0,
    holdStartTime: 0,
    swipeStartY: 0,
    holdTimer: null,
    capturedPointerId: null,
  });
  const targetRef = useRef<HTMLElement | null>(null);

  const REQUIRED_TAPS = 5;
  const TAP_WINDOW_MS = 3000;
  const HOLD_DURATION_MS = 1500;
  const SWIPE_DISTANCE_PX = 100;

  const reset = useCallback(() => {
    const state = stateRef.current;
    if (state.holdTimer) clearTimeout(state.holdTimer);

    // B.5: Release pointer capture
    if (state.capturedPointerId !== null && targetRef.current) {
      try {
        targetRef.current.releasePointerCapture(state.capturedPointerId);
      } catch {
        /* ignore */
      }
    }

    stateRef.current = {
      phase: 'idle',
      tapCount: 0,
      tapStartTime: 0,
      holdStartTime: 0,
      swipeStartY: 0,
      holdTimer: null,
      capturedPointerId: null,
    };
  }, []);

  const showNeutralEasterEgg = useCallback(() => {
    setShowEasterEgg(true);
    setTimeout(() => setShowEasterEgg(false), 500);
    reset();
  }, [reset]);

  const handlers = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        const state = stateRef.current;
        const now = Date.now();
        targetRef.current = e.currentTarget as HTMLElement;

        if (state.phase === 'idle' || state.phase === 'tapping') {
          // Check tap window timeout
          if (state.tapCount > 0 && now - state.tapStartTime > TAP_WINDOW_MS) {
            showNeutralEasterEgg();
            return;
          }

          state.phase = 'tapping';
          if (state.tapCount === 0) state.tapStartTime = now;
          state.tapCount++;

          if (state.tapCount >= REQUIRED_TAPS) {
            // Transition to holding phase
            state.phase = 'holding';
            state.holdStartTime = now;

            // B.5: Capture pointer for mobile reliability
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
              state.capturedPointerId = e.pointerId;
            } catch {
              /* ignore */
            }

            state.holdTimer = setTimeout(() => {
              state.phase = 'swiping';
              state.swipeStartY = 0; // Will be set in onPointerMove
            }, HOLD_DURATION_MS);
          }
        }
      },

      onPointerUp: (_e: React.PointerEvent) => {
        const state = stateRef.current;

        if (state.phase === 'holding') {
          // Released too early
          showNeutralEasterEgg();
        } else if (state.phase === 'swiping') {
          // B.5: Swipe not completed — reset
          showNeutralEasterEgg();
        }
      },

      onPointerMove: (e: React.PointerEvent) => {
        const state = stateRef.current;

        if (state.phase === 'swiping') {
          if (state.swipeStartY === 0) {
            state.swipeStartY = e.clientY;
          }

          const swipeDistance = e.clientY - state.swipeStartY;
          if (swipeDistance >= SWIPE_DISTANCE_PX) {
            // Success!
            reset();
            onSuccess();
          }
        }
      },

      onPointerLeave: (e: React.PointerEvent) => {
        const state = stateRef.current;
        // Only if pointer is not captured
        if (state.phase !== 'idle' && state.capturedPointerId !== e.pointerId) {
          showNeutralEasterEgg();
        }
      },

      onPointerCancel: () => {
        const state = stateRef.current;
        if (state.phase !== 'idle') {
          showNeutralEasterEgg();
        }
      },
    }),
    [onSuccess, reset, showNeutralEasterEgg]
  );

  const EasterEggAnimation = showEasterEgg
    ? React.createElement('div', {
        className: 'absolute inset-0 pointer-events-none animate-pulse opacity-30 bg-primary/20 rounded-lg',
      })
    : null;

  return { handlers, EasterEggAnimation };
}
