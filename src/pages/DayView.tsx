import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import { getEntriesByDate } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { EntryCard } from '@/components/EntryCard';
import { BiographyDisplay } from '@/components/BiographyDisplay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getBiography, StoredBiography } from '@/lib/biographyService';
import { loadAISettings } from '@/lib/aiConfig';
import { useI18n } from '@/lib/i18n';
import { GrimoireIcon } from '@/components/icons/SigilIcon';

function DayViewContent() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const aiSettings = loadAISettings();

  const entries = useLiveQuery(
    () => (date ? getEntriesByDate(date) : Promise.resolve([])),
    [date]
  );
  
  const [biography, setBiography] = useState<StoredBiography | undefined>();
  
  useEffect(() => {
    if (date) {
      getBiography(date).then(setBiography);
    }
  }, [date]);

  const dateFormatted = date 
    ? format(parseISO(date), "d MMMM yyyy, EEEE", { locale })
    : '';

  const getEntriesLabel = (count: number) => {
    if (language === 'en') {
      return count === 1 ? 'entry' : 'entries';
    }
    if (count === 1) return t('today.entry');
    if (count >= 2 && count <= 4) return t('today.entries2_4');
    return t('today.entries5_');
  };

  if (!entries) {
    return (
      <div className="min-h-screen cyber-noise rune-grid">
        <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </header>
        <main className="space-y-4 px-4 py-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-cyber-glow/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-serif font-medium capitalize">{dateFormatted}</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length === 0
              ? t('day.noEntries')
              : `${entries.length} ${getEntriesLabel(entries.length)}`}
          </p>
        </div>
      </header>

      <main className="px-4 pt-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 p-8 panel-glass">
              <GrimoireIcon className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-serif font-medium">{t('day.noEntries')}</h3>
            <p className="mb-6 max-w-xs text-sm text-muted-foreground">
              {t('day.noEntriesHint')}
            </p>
            <Button onClick={() => navigate('/new')} className="btn-cyber">
              {t('day.createEntry')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Biography Display */}
            {date && aiSettings.enabled && (
              <BiographyDisplay
                date={date}
                biography={biography}
                onUpdate={setBiography}
                showGenerateButton={true}
              />
            )}
            
            {/* Entries */}
            <div className="space-y-3">
              {entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DayView() {
  return (
    <ErrorBoundary>
      <DayViewContent />
    </ErrorBoundary>
  );
}
