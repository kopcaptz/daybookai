import { createContext, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { GrimoireIcon } from '@/components/icons/SigilIcon';
import { cn } from '@/lib/utils';

interface TransitionState {
  phase: 'idle' | 'preparing' | 'expanding' | 'complete';
  sourceRect: DOMRect | null;
  targetPath: string | null;
}

interface HeroTransitionContextValue {
  startTransition: (sourceElement: HTMLElement | null, path: string) => void;
  phase: TransitionState['phase'];
}

export const HeroTransitionContext = createContext<HeroTransitionContextValue>({
  startTransition: () => {},
  phase: 'idle',
});

const TRANSITION_DURATION = 500; // ms

export function HeroTransitionProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<TransitionState>({
    phase: 'idle',
    sourceRect: null,
    targetPath: null,
  });

  // Check for reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const startTransition = useCallback((sourceElement: HTMLElement | null, path: string) => {
    // Skip animation if reduced motion or no source element
    if (prefersReducedMotion || !sourceElement) {
      navigate(path);
      return;
    }

    const rect = sourceElement.getBoundingClientRect();
    
    setState({
      phase: 'preparing',
      sourceRect: rect,
      targetPath: path,
    });

    // Start expansion after next frame for CSS transition to work
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setState(prev => ({ ...prev, phase: 'expanding' }));
      });
    });

    // Navigate after animation completes
    setTimeout(() => {
      navigate(path);
      setState(prev => ({ ...prev, phase: 'complete' }));
      
      // Reset after page has loaded
      setTimeout(() => {
        setState({ phase: 'idle', sourceRect: null, targetPath: null });
      }, 150);
    }, TRANSITION_DURATION);
  }, [navigate, prefersReducedMotion]);

  return (
    <HeroTransitionContext.Provider value={{ startTransition, phase: state.phase }}>
      {children}
      {state.phase !== 'idle' && state.sourceRect && (
        <TransitionOverlay 
          sourceRect={state.sourceRect} 
          phase={state.phase}
        />
      )}
    </HeroTransitionContext.Provider>
  );
}

function TransitionOverlay({ 
  sourceRect, 
  phase 
}: { 
  sourceRect: DOMRect; 
  phase: TransitionState['phase'];
}) {
  const isExpanding = phase === 'expanding' || phase === 'complete';
  
  // Ghost element styles - animate from button to fullscreen
  const ghostStyle: React.CSSProperties = isExpanding
    ? {
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        opacity: 0,
        transition: `all ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }
    : {
        top: sourceRect.top,
        left: sourceRect.left,
        width: sourceRect.width,
        height: sourceRect.height,
        borderRadius: '0.5rem',
        opacity: 1,
      };

  return createPortal(
    <div className="hero-transition-overlay" aria-hidden="true">
      {/* Backdrop dim with blur */}
      <div className={cn(
        "hero-backdrop",
        isExpanding && "active"
      )} />
      
      {/* Morphing ghost element */}
      <div 
        className={cn(
          "hero-transition-ghost",
          isExpanding && "hero-transition-glow"
        )}
        style={ghostStyle}
      >
        <GrimoireIcon 
          className={cn(
            "text-primary-foreground transition-all duration-300",
            isExpanding ? "h-0 w-0 opacity-0" : "h-6 w-6 opacity-100"
          )}
        />
      </div>
    </div>,
    document.body
  );
}
