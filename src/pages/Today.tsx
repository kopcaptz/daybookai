import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Loader2, Plus } from 'lucide-react';
import { getEntriesByDate } from '@/lib/db';
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
import { GrimoireIcon, SealGlyph } from '@/components/icons/SigilIcon';

function TodayContent() {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), "d MMMM, EEEE", { locale });
  
  const entries = useLiveQuery(() => getEntriesByDate(today), [today]);
  
  const [biography, setBiography] = useState<StoredBiography | undefined>();
  const [quickReminderOpen, setQuickReminderOpen] = useState(false);
  const { prompt, isGenerating, generate, dismiss } = useBiographyPrompts();
  const aiSettings = loadAISettings();
  
  // Load biography for today
  useEffect(() => {
    getBiography(today).then(setBiography);
  }, [today]);
  
  const handleBiographyUpdate = (bio: StoredBiography) => {
    setBiography(bio);
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
        <div className="flex items-center gap-3">
          <div className="relative">
            <GrimoireIcon className="h-7 w-7 text-cyber-sigil" />
            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyber-glow animate-sigil-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-serif font-medium text-foreground tracking-wide">
              {t('app.name')}
            </h1>
            <p className="text-xs text-cyber-sigil/60 tracking-widest uppercase">
              {t('app.subtitle')}
            </p>
          </div>
        </div>

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
        <RemindersSection />
        
        {/* Biography Prompt Dialog */}
        <BiographyPromptDialog
          prompt={prompt}
          isGenerating={isGenerating}
          onGenerate={() => prompt && generate(prompt.date)}
          onDismiss={dismiss}
        />
        
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 p-8 panel-glass relative">
              <GrimoireIcon className="h-12 w-12 text-muted-foreground" />
              {/* Seal glyph accents */}
              <div className="absolute top-3 right-3 text-cyber-sigil/40">
                <SealGlyph size={12} />
              </div>
              <div className="absolute bottom-3 left-3 text-cyber-rune/30">
                <SealGlyph size={12} />
              </div>
            </div>
            <h3 className="mb-2 text-xl font-serif font-medium">{t('today.startDay')}</h3>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              {t('today.startDayHint')}
            </p>
            {/* Rune decoration */}
            <div className="mt-6 flex items-center gap-3 text-cyber-sigil/30">
              <SealGlyph size={10} />
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-cyber-glow/30 to-transparent" />
              <SealGlyph size={10} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Biography section */}
            {aiSettings.enabled && (
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
                  <EntryCard entry={entry} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
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
