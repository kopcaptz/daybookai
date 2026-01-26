import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BookOpen, LayoutDashboard, PenLine, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { setOnboarded } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

// Icons for each slide (decorative)
const slideIcons = [BookOpen, LayoutDashboard, PenLine, Shield];

// Swipe gesture constants
const SWIPE_THRESHOLD = 60; // px to trigger slide change
const AXIS_LOCK_THRESHOLD = 10; // px to determine horizontal vs vertical intent

const slides = {
  ru: [
    {
      title: 'Добро пожаловать',
      body: 'Кибер-Гримуар — дневник и мягкие подсказки на каждый день.',
    },
    {
      title: 'Сегодня — ваш хаб',
      body: 'На вкладке «Сегодня» — записи дня и напоминания (Overdue/Today/Upcoming).',
    },
    {
      title: 'Записи и календарь',
      body: 'Создавайте записи быстро, а «Календарь» помогает видеть ритм и настроение.',
    },
    {
      title: 'Приватность и контроль',
      body: 'Ваши данные хранятся локально. Язык и тема — в «Настройках».',
    },
  ],
  en: [
    {
      title: 'Welcome',
      body: 'Cyber-Grimoire is a journal with gentle nudges for each day.',
    },
    {
      title: 'Today is your hub',
      body: "In Today you'll see your entries and reminders (Overdue/Today/Upcoming).",
    },
    {
      title: 'Entries & Calendar',
      body: 'Capture entries quickly, and Calendar helps you see your rhythm and mood.',
    },
    {
      title: 'Privacy & control',
      body: 'Your data stays local. Language and theme are in Settings.',
    },
  ],
};

const labels = {
  ru: {
    skip: 'Пропустить',
    next: 'Далее',
    back: 'Назад',
    start: 'Начать',
    openSettings: 'Открыть настройки',
  },
  en: {
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    start: 'Start',
    openSettings: 'Open settings',
  },
};

export default function OnboardingPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [dragOffset, setDragOffset] = useState(0);

  // Swipe tracking refs (to avoid re-renders during gesture)
  const swipeRef = useRef({
    startX: 0,
    startY: 0,
    isTracking: false,
    axisLocked: false,
    isHorizontal: false,
  });

  const currentSlides = slides[language];
  const currentLabels = labels[language];
  const isLastSlide = currentSlide === currentSlides.length - 1;
  const isFirstSlide = currentSlide === 0;

  const goToSlide = (index: number) => {
    if (index === currentSlide) return;
    setSlideDirection(index > currentSlide ? 'right' : 'left');
    setCurrentSlide(index);
    setDragOffset(0);
  };

  const handleSkip = () => {
    setOnboarded();
    navigate('/');
  };

  const handleNext = () => {
    if (isLastSlide) {
      setOnboarded();
      navigate('/');
    } else {
      goToSlide(currentSlide + 1);
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        if (currentSlide < currentSlides.length - 1) {
          goToSlide(currentSlide + 1);
        }
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        if (currentSlide > 0) {
          goToSlide(currentSlide - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        handleNext();
        break;
      case 'Escape':
        e.preventDefault();
        handleSkip();
        break;
    }
  }, [currentSlide, currentSlides.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOpenSettings = () => {
    setOnboarded();
    navigate('/settings');
  };

  // Swipe gesture handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only track touch/pen, ignore mouse
    if (e.pointerType === 'mouse') return;

    swipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isTracking: true,
      axisLocked: false,
      isHorizontal: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ref = swipeRef.current;
    if (!ref.isTracking) return;

    const deltaX = e.clientX - ref.startX;
    const deltaY = e.clientY - ref.startY;

    // Lock axis after threshold movement
    if (!ref.axisLocked) {
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (absDeltaX > AXIS_LOCK_THRESHOLD || absDeltaY > AXIS_LOCK_THRESHOLD) {
        ref.axisLocked = true;
        ref.isHorizontal = absDeltaX > absDeltaY;

        // If vertical intent, cancel tracking
        if (!ref.isHorizontal) {
          ref.isTracking = false;
          setDragOffset(0);
          return;
        }
      }
    }

    // Apply drag offset for horizontal swipes (clamped for visual feedback)
    if (ref.isHorizontal) {
      // Clamp offset: don't allow over-drag at boundaries
      let clampedOffset = deltaX;
      if (isFirstSlide && deltaX > 0) {
        clampedOffset = deltaX * 0.3; // Resistance at start
      }
      if (isLastSlide && deltaX < 0) {
        clampedOffset = deltaX * 0.3; // Resistance at end
      }
      setDragOffset(clampedOffset);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const ref = swipeRef.current;
    if (!ref.isTracking) return;

    const deltaX = e.clientX - ref.startX;

    // Check if we should change slide
    if (ref.isHorizontal) {
      if (deltaX < -SWIPE_THRESHOLD && !isLastSlide) {
        // Swipe left → next slide
        goToSlide(currentSlide + 1);
      } else if (deltaX > SWIPE_THRESHOLD && !isFirstSlide) {
        // Swipe right → previous slide
        goToSlide(currentSlide - 1);
      } else {
        // Snap back
        setDragOffset(0);
      }
    }

    // Reset tracking
    swipeRef.current = {
      startX: 0,
      startY: 0,
      isTracking: false,
      axisLocked: false,
      isHorizontal: false,
    };
  };

  const handlePointerCancel = () => {
    swipeRef.current.isTracking = false;
    setDragOffset(0);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/30 relative overflow-hidden">
      {/* Subtle neutral radial glow in center */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 40%, hsl(var(--muted-foreground) / 0.04) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      {/* Skip button */}
      <div className="flex justify-end p-4 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          className="text-muted-foreground hover:text-foreground"
        >
          {currentLabels.skip}
        </Button>
      </div>

      {/* Slide content - swipeable area */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-8 touch-pan-y relative z-10"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
      >
        {/* Card surface */}
        <div
          key={currentSlide}
          className={cn(
            'text-center max-w-md w-full select-none',
            'bg-background/80 backdrop-blur-sm',
            'border border-border/50 rounded-2xl',
            'p-6 sm:p-8 shadow-lg shadow-primary/5',
            // Only apply CSS animation when not dragging
            dragOffset === 0 && 'animate-in fade-in duration-300',
            dragOffset === 0 && (slideDirection === 'right' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'),
            dragOffset === 0 && 'motion-reduce:slide-in-from-right-0 motion-reduce:slide-in-from-left-0'
          )}
          style={{
            // Apply drag offset during swipe
            transform: dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
            transition: dragOffset !== 0 ? 'none' : undefined,
          }}
        >
          {/* Slide icon */}
          {(() => {
            const Icon = slideIcons[currentSlide];
            return (
              <div className="relative inline-block mb-5">
                {/* Icon glow */}
                <div 
                  className="absolute inset-0 rounded-full blur-xl bg-primary/20"
                  aria-hidden="true"
                />
                <Icon
                  className="relative h-12 w-12 mx-auto text-primary"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </div>
            );
          })()}
          <h1 className="text-2xl font-semibold text-foreground mb-3">
            {currentSlides[currentSlide].title}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {currentSlides[currentSlide].body}
          </p>
        </div>

        {/* Secondary CTA on last slide */}
        {isLastSlide && (
          <Button
            variant="link"
            size="sm"
            onClick={handleOpenSettings}
            className="mt-6 text-muted-foreground"
          >
            {currentLabels.openSettings}
          </Button>
        )}
      </div>

      {/* Navigation controls */}
      <div className="p-6 pb-8 space-y-4 relative z-10">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {currentSlides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goToSlide(index)}
              aria-label={language === 'ru' ? `Перейти к слайду ${index + 1}` : `Go to slide ${index + 1}`}
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-colors duration-200 cursor-pointer',
                'hover:scale-110 active:scale-95 transition-transform',
                index === currentSlide
                  ? 'bg-primary'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
            />
          ))}
        </div>

        {/* Back / Next buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentSlide === 0}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentLabels.back}
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {isLastSlide ? currentLabels.start : currentLabels.next}
            {!isLastSlide && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
