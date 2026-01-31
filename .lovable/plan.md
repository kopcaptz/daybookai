
# Shared Element Transition: "Opening the Grimoire" Hero Animation

## Overview

This plan implements a smooth Shared Element Transition (Hero animation) that transforms the central icon in the BottomNav into the full "Create Entry" page, creating the sensation of "opening" a digital grimoire.

---

## Current State Analysis

**BottomNav Center Button:**
- Located in `src/components/BottomNav.tsx` (lines 41-77)
- 14x14 (56px) rounded-lg button with Feather icon
- Currently dispatches `grimoire-ritual-start` event and navigates after 400ms delay
- Has glow accent and `grimoire-shadow` styling

**Today Empty State:**
- `BreathingSigil` component in `src/components/icons/BreathingSigil.tsx`
- Contains `GrimoireIcon` with breathing animation, orbital particles, ambient glow
- Responds to `ritualActive` state for visual feedback

**PageTransition Component:**
- Currently empty wrapper (no actual transitions) in `src/components/PageTransition.tsx`
- Perfect candidate for enhancement

---

## Architecture: View Transition API + CSS Fallback

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    SHARED ELEMENT TRANSITION FLOW                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌──────────────┐     ┌────────────────────┐   │
│  │ BottomNav   │     │  Transition  │     │    NewEntry Page   │   │
│  │ [+] Button  │────>│    Layer     │────>│   (expanded view)  │   │
│  │   (56px)    │     │  (overlay)   │     │   (fullscreen)     │   │
│  └─────────────┘     └──────────────┘     └────────────────────┘   │
│        │                    │                       │               │
│        │  1. Capture        │  2. Animate           │  3. Morph     │
│        │     position       │     expand            │     to page   │
│        └────────────────────┴───────────────────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Strategy

### Approach: CSS + React State Transition Layer

Since we're using React Router (not Next.js), we'll create a **transition overlay layer** that:

1. Captures the button's position via `getBoundingClientRect()`
2. Creates a floating "ghost" element that animates from button → fullscreen
3. Uses CSS `transform` and `opacity` for GPU-accelerated performance
4. Fades in the destination page as the animation completes

---

## File Changes

### 1. NEW: `src/components/HeroTransition.tsx`

Central component managing the transition animation:

```tsx
interface HeroTransitionState {
  isActive: boolean;
  sourceRect: DOMRect | null;
  targetPath: string;
}
```

**Features:**
- Portal-rendered overlay (z-index: 100)
- Morphing "ghost" sigil element
- Background dim/glow effect
- GPU-accelerated transforms only

### 2. NEW: `src/hooks/useHeroTransition.ts`

Hook providing transition control:

```tsx
const { startTransition, isTransitioning } = useHeroTransition();

// In BottomNav:
startTransition(buttonRef, '/new');
```

### 3. MODIFY: `src/components/BottomNav.tsx`

```tsx
// Add ref to capture button position
const centerButtonRef = useRef<HTMLButtonElement>(null);
const { startTransition } = useHeroTransition();

const handleCenterClick = (e: React.MouseEvent) => {
  e.preventDefault();
  navigator.vibrate?.(15);
  
  // Start hero transition
  startTransition(centerButtonRef.current, '/new');
};
```

### 4. MODIFY: `src/pages/NewEntry.tsx`

Add entrance animation classes:

```tsx
// Wrap content with entrance animation
<div className={cn(
  "min-h-screen",
  isEntering && "animate-portal-enter"
)}>
```

### 5. ADD TO: `tailwind.config.ts`

New keyframes for the hero animation:

```typescript
keyframes: {
  // Existing...
  
  // Hero transition: button → fullscreen
  "hero-expand": {
    "0%": { 
      transform: "translate(var(--start-x), var(--start-y)) scale(0.1)",
      borderRadius: "0.5rem",
      opacity: "1"
    },
    "60%": {
      transform: "translate(50%, 40%) scale(0.5)",
      borderRadius: "1rem",
      opacity: "1"
    },
    "100%": { 
      transform: "translate(0, 0) scale(1)",
      borderRadius: "0",
      opacity: "0"
    }
  },
  
  // Page entrance (after hero)
  "page-materialize": {
    "0%": { 
      opacity: "0",
      transform: "scale(1.02)",
      filter: "blur(4px)"
    },
    "100%": { 
      opacity: "1",
      transform: "scale(1)",
      filter: "blur(0)"
    }
  },
  
  // Glow pulse during transition
  "transition-glow": {
    "0%, 100%": { 
      boxShadow: "0 0 60px 20px hsl(var(--glow-primary) / 0.3)"
    },
    "50%": { 
      boxShadow: "0 0 100px 40px hsl(var(--glow-primary) / 0.5)"
    }
  }
}
```

### 6. ADD TO: `src/index.css`

```css
/* Hero Transition Overlay */
.hero-transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  background: transparent;
}

.hero-transition-ghost {
  position: fixed;
  will-change: transform, opacity, border-radius;
  transform-origin: center center;
  background: linear-gradient(
    135deg,
    hsl(var(--primary)),
    hsl(var(--accent))
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Performance: GPU compositing */
.hero-transition-ghost,
.hero-transition-overlay {
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* Backdrop dim during transition */
.hero-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(var(--background) / 0.8);
  backdrop-filter: blur(8px);
  opacity: 0;
  transition: opacity 300ms ease-out;
}

.hero-backdrop.active {
  opacity: 1;
}
```

---

## Detailed Component: HeroTransition.tsx

```tsx
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { GrimoireIcon } from '@/components/icons/SigilIcon';
import { cn } from '@/lib/utils';

interface TransitionState {
  phase: 'idle' | 'preparing' | 'expanding' | 'complete';
  sourceRect: DOMRect | null;
  targetPath: string | null;
}

const TRANSITION_DURATION = 500; // ms

export function HeroTransitionProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<TransitionState>({
    phase: 'idle',
    sourceRect: null,
    targetPath: null,
  });

  const startTransition = useCallback((sourceElement: HTMLElement | null, path: string) => {
    if (!sourceElement) {
      navigate(path);
      return;
    }

    const rect = sourceElement.getBoundingClientRect();
    
    setState({
      phase: 'preparing',
      sourceRect: rect,
      targetPath: path,
    });

    // Start expansion after next frame
    requestAnimationFrame(() => {
      setState(prev => ({ ...prev, phase: 'expanding' }));
    });

    // Navigate after animation
    setTimeout(() => {
      navigate(path);
      setState({ phase: 'complete', sourceRect: null, targetPath: null });
      
      // Reset after page loads
      setTimeout(() => {
        setState({ phase: 'idle', sourceRect: null, targetPath: null });
      }, 100);
    }, TRANSITION_DURATION);
  }, [navigate]);

  // Expose via context
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
  phase: string;
}) {
  const isExpanding = phase === 'expanding' || phase === 'complete';
  
  // Calculate center position for the ghost element
  const ghostStyle: React.CSSProperties = isExpanding
    ? {
        // Animate to fullscreen
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        opacity: 0,
        transition: `all ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }
    : {
        // Start at button position
        top: sourceRect.top,
        left: sourceRect.left,
        width: sourceRect.width,
        height: sourceRect.height,
        borderRadius: '0.5rem',
        opacity: 1,
      };

  return createPortal(
    <div className="hero-transition-overlay">
      {/* Backdrop dim */}
      <div className={cn(
        "hero-backdrop",
        isExpanding && "active"
      )} />
      
      {/* Morphing ghost element */}
      <div 
        className={cn(
          "hero-transition-ghost",
          isExpanding && "animate-transition-glow"
        )}
        style={ghostStyle}
      >
        <GrimoireIcon 
          className={cn(
            "text-primary-foreground transition-all",
            isExpanding ? "h-0 w-0 opacity-0" : "h-6 w-6"
          )}
          style={{ 
            transitionDuration: `${TRANSITION_DURATION}ms`,
            transitionDelay: '100ms'
          }}
        />
      </div>
    </div>,
    document.body
  );
}
```

---

## Visual Effect: Glow + Pulse on Tappable Icon

### Current State Enhancement

The center button already has:
- `hover:animate-pulse-glow` 
- `grimoire-shadow`

### Add Idle Pulsing Indicator

```tsx
// In BottomNav center button:
<div className={cn(
  "flex h-14 w-14 items-center justify-center rounded-lg",
  "bg-gradient-to-br from-primary via-primary to-accent",
  "border border-cyber-glow/30",
  "relative overflow-hidden grimoire-shadow",
  // NEW: Subtle idle pulse
  "animate-pulse-glow-subtle"
)}>
  {/* Glow accent */}
  <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-cyber-glow/20 blur-sm" />
  
  {/* NEW: Pulsing ring indicator */}
  <div className="absolute inset-0 rounded-lg border-2 border-cyber-glow/30 animate-ping-slow opacity-50" />
  
  <Icon className="h-6 w-6 text-primary-foreground relative z-10" />
</div>
```

### New Animation for Subtle Affordance

```typescript
// tailwind.config.ts
keyframes: {
  "pulse-glow-subtle": {
    "0%, 100%": { 
      boxShadow: "0 0 12px hsl(var(--glow-primary) / 0.15)"
    },
    "50%": { 
      boxShadow: "0 0 20px hsl(var(--glow-primary) / 0.25)"
    }
  },
  "ping-slow": {
    "0%": { transform: "scale(1)", opacity: "0.4" },
    "50%": { transform: "scale(1.05)", opacity: "0" },
    "100%": { transform: "scale(1)", opacity: "0" }
  }
}
```

---

## Performance Considerations

### GPU Acceleration
- Use only `transform` and `opacity` for animations
- Apply `will-change: transform, opacity` during transition
- Use `translateZ(0)` to force GPU compositing

### Avoid Layout Thrashing
- Capture `getBoundingClientRect()` once at start
- Don't read layout during animation
- Use CSS custom properties for position if needed

### Memory
- Remove portal overlay after transition completes
- Don't keep ghost elements in DOM when idle

---

## Background Color Transition

The ghost element uses a gradient matching the button:

```css
background: linear-gradient(
  135deg,
  hsl(var(--primary)),
  hsl(var(--accent))
);
```

During expansion, it transitions to:

```css
background: hsl(var(--background));
opacity: 0; /* Fades out as page appears */
```

The page (`NewEntry`) has `bg-background` which provides seamless handoff.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/HeroTransition.tsx` | CREATE | Transition overlay + context |
| `src/hooks/useHeroTransition.ts` | CREATE | Hook for triggering transition |
| `src/components/BottomNav.tsx` | MODIFY | Add ref, use transition hook |
| `src/pages/NewEntry.tsx` | MODIFY | Add entrance animation |
| `src/App.tsx` | MODIFY | Wrap with HeroTransitionProvider |
| `tailwind.config.ts` | MODIFY | Add transition keyframes |
| `src/index.css` | MODIFY | Add transition overlay styles |

---

## Demo Flow

1. User sees center button with subtle pulsing glow
2. User taps the `+` button
3. Haptic feedback fires (15ms vibrate)
4. `grimoire-ritual-start` event dispatched (for Today page sigil reaction)
5. Ghost element captures button position
6. Ghost expands from 56px → fullscreen over 500ms
7. Background dims with blur
8. Icon inside ghost fades out
9. At 500ms: navigate to `/new`
10. `NewEntry` page fades in with slight scale-down (1.02 → 1)
11. Transition overlay unmounts
12. User is now in entry creation mode

---

## Accessibility

- Respects `prefers-reduced-motion`: Skip animation, instant navigate
- Focus management: Auto-focus textarea on NewEntry
- No content blocked during transition (overlay is pointer-events: none)

---

## Known Limitations

1. **No reverse animation**: Back navigation uses standard behavior (could be Phase 2)
2. **Single trigger source**: Only BottomNav button for now (Today empty state click could be added)
3. **No View Transitions API**: Safari doesn't fully support it yet; using CSS fallback

---

## Acceptance Criteria

- [ ] Tapping `+` triggers smooth 500ms expand animation
- [ ] Icon morphs/fades as ghost expands
- [ ] Background dims during transition
- [ ] `NewEntry` page appears with subtle entrance
- [ ] No jank or layout shifts
- [ ] Works on mobile (touch) and desktop (click)
- [ ] Respects reduced motion preference
- [ ] Haptic feedback fires on tap
