import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { setOnboarded } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

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

  const currentSlides = slides[language];
  const currentLabels = labels[language];
  const isLastSlide = currentSlide === currentSlides.length - 1;

  const handleSkip = () => {
    setOnboarded();
    navigate('/');
  };

  const handleNext = () => {
    if (isLastSlide) {
      setOnboarded();
      navigate('/');
    } else {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleOpenSettings = () => {
    setOnboarded();
    navigate('/settings');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Skip button */}
      <div className="flex justify-end p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          className="text-muted-foreground hover:text-foreground"
        >
          {currentLabels.skip}
        </Button>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8">
        <div
          key={currentSlide}
          className="text-center max-w-sm animate-in fade-in duration-300"
        >
          <h1 className="text-2xl font-semibold text-foreground mb-4">
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
      <div className="p-6 pb-8 space-y-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2">
          {currentSlides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentSlide(index)}
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
