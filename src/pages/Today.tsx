import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Loader2, Plus, CheckSquare, X, MessageSquare } from 'lucide-react';
import { getEntriesByDate, createDiscussionSession } from '@/lib/db';
import { EntryCard } from '@/components/EntryCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BiographyDisplay } from '@/components/BiographyDisplay';
import { BiographyPromptDialog } from '@/components/BiographyPromptDialog';
import { RemindersSection } from '@/components/reminders/RemindersSection';
import { QuickReminderSheet } from '@/components/reminders/QuickReminderSheet';
import { WeeklyInsightsWidget } from '@/components/WeeklyInsightsWidget';
import { useBiographyPrompts } from '@/hooks/useBiographyPrompts';
import { getBiography, StoredBiography, getTodayDate } from '@/lib/biographyService';
import { loadAISettings } from '@/lib/aiConfig';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { GrimoireIcon } from '@/components/icons/SigilIcon';
import { BreathingSigil } from '@/components/icons/BreathingSigil';
import { useOracleWhisper } from '@/hooks/useOracleWhisper';
import { useHeroTransition } from '@/hooks/useHeroTransition';
import { cn } from '@/lib/utils';

function TodayContent() {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), "d MMMM, EEEE", { locale });
  
  const entries = useLiveQuery(() => getEntriesByDate(today), [today]);
  
  const [biography, setBiography] = useState<StoredBiography | undefined>();
  const [quickReminderOpen, setQuickReminderOpen] = useState(false);
  const { prompt, isGenerating, generate, dismiss } = useBiographyPrompts();
  const aiSettings = loadAISettings();
  
  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [creatingDiscussion, setCreatingDiscussion] = useState(false);
  
  // Ritual animation state
  const [ritualActive, setRitualActive] = useState(false);
  
  // Oracle whisper for empty state
  const { whisper } = useOracleWhisper();
  
  // Hero transition for sigil click
  const { startTransition } = useHeroTransition();
  const sigilRef = useRef<HTMLButtonElement>(null);
  
  // Check if we should enter select mode from URL
  useEffect(() => {
    if (searchParams.get('selectMode') === 'true') {
      setSelectionMode(true);
    }
  }, [searchParams]);
  
  // Listen for ritual activation from BottomNav
  useEffect(() => {
    const handleRitual = () => {
      setRitualActive(true);
      // Reset after animation completes
      setTimeout(() => setRitualActive(false), 600);
    };
    
    window.addEventListener('grimoire-ritual-start', handleRitual);
    return () => window.removeEventListener('grimoire-ritual-start', handleRitual);
  }, []);
  
  // Load biography for today
  useEffect(() => {
    getBiography(today).then(setBiography);
  }, [today]);
  
  const handleBiographyUpdate = (bio: StoredBiography) => {
    setBiography(bio);
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStartDiscussion = async () => {
    if (selectedIds.size === 0) return;
    setCreatingDiscussion(true);
    
    try {
      const sessionId = await createDiscussionSession({
        title: language === 'ru' ? 'Новое обсуждение' : 'New discussion',
        scope: { entryIds: Array.from(selectedIds), docIds: [] },
        modeDefault: 'discuss',
      });
      
      setSelectionMode(false);
      setSelectedIds(new Set());
      navigate(`/discussions/${sessionId}`);
    } finally {
      setCreatingDiscussion(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const getEntriesLabel = (count: number) => {
    if (language === 'en') {
      return count === 1 ? 'entry' : 'entries';
    }
    // Russian pluralization
    if (count === 1) return t('today.entry');
    if (count >= 2 && count <= 4) return t('today.entries2_4');
    return t('today.entries5_');
  };

  if (!entries) {
    return (
      <div className="space-y-4 px-4 pt-24">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted grimoire-shadow" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-6 border-b border-border/50">
        {/* Brand header */}
        <div className="flex items-center justify-center">
          <div className="text-center min-w-0 relative select-none">
            <h1 className="text-xl font-serif font-medium text-foreground tracking-wide truncate">
              {t('app.name')}
            </h1>
            <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
              {t('app.subtitle')}
            </p>
          </div>
        </div>
        
        {/* Select button - positioned absolute right */}
        {entries.length > 0 && !selectionMode && (
          <div className="absolute top-6 right-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="text-xs gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              {t('today.select')}
            </Button>
          </div>
        )}

        {/* Date, entry count, and quick reminder button */}
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-sm capitalize text-muted-foreground">
              {todayFormatted}
            </p>
            <p className="text-xs text-muted-foreground">
              {entries.length === 0
                ? t('today.noEntries')
                : `${entries.length} ${getEntriesLabel(entries.length)}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickReminderOpen(true)}
            className="text-xs gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {language === 'ru' ? 'Напоминание' : 'Reminder'}
          </Button>
        </div>

        {/* Rune divider */}
        <div className="mt-4 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>

      <main className="px-4 pt-4">
        {/* Weekly Insights Widget */}
        <WeeklyInsightsWidget />
        
        {/* Gentle Nudges: Reminders Section */}
        <div id="reminders-section">
          <RemindersSection />
        </div>
        
        {/* Biography Prompt Dialog */}
        <BiographyPromptDialog
          prompt={prompt}
          isGenerating={isGenerating}
          onGenerate={() => prompt && generate(prompt.date)}
          onDismiss={dismiss}
        />
        
        {entries.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center justify-center py-16 text-center transition-all duration-300",
            ritualActive && "scale-95 opacity-60"
          )}>
            {/* Breathing Sigil with orbital particles - Interactive */}
            <div className="mb-6">
              <BreathingSigil 
                ref={sigilRef}
                ritualActive={ritualActive}
                interactive={true}
                onClick={() => {
                  navigator.vibrate?.(15);
                  window.dispatchEvent(new CustomEvent('grimoire-ritual-start'));
                  startTransition(sigilRef.current, '/new');
                }}
              />
            </div>
            
            <h3 className="mb-2 text-xl font-serif font-medium">{t('today.startDay')}</h3>
            
            {/* Oracle Whisper */}
            {whisper && (
              <p className="max-w-xs text-sm text-cyber-sigil/80 italic font-serif animate-fade-in mb-3">
                "{whisper}"
              </p>
            )}
            
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              {t('today.startDayHint')}
            </p>
            
            {/* Rune decoration */}
            <div className="mt-6 flex items-center gap-3 text-cyber-sigil/30">
              <span className="text-[8px]">◇</span>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />
              <span className="text-[8px]">◇</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Biography section */}
            {aiSettings.enabled && !selectionMode && (
              <BiographyDisplay
                date={today}
                biography={biography}
                onUpdate={handleBiographyUpdate}
                showGenerateButton={true}
              />
            )}
            
            {/* Entries */}
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div 
                  key={entry.id} 
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <EntryCard 
                    entry={entry}
                    selectable={selectionMode}
                    selected={entry.id ? selectedIds.has(entry.id) : false}
                    onSelect={handleToggleSelection}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
      {/* Selection mode floating action bar */}
      {selectionMode && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-3 bg-card/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-xl grimoire-shadow">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelSelection}
              className="gap-1.5"
            >
              <X className="h-4 w-4" />
              {t('today.cancel')}
            </Button>
            
            <div className="w-px h-6 bg-border" />
            
            <Button
              onClick={handleStartDiscussion}
              disabled={selectedIds.size === 0 || creatingDiscussion}
              size="sm"
              className="gap-1.5"
            >
              {creatingDiscussion ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              {t('today.discuss')} ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}
      
      {/* Quick Reminder Sheet */}
      <QuickReminderSheet
        open={quickReminderOpen}
        onOpenChange={setQuickReminderOpen}
      />
    </div>
  );
}

export default function Today() {
  return (
    <ErrorBoundary>
      <TodayContent />
    </ErrorBoundary>
  );
}
