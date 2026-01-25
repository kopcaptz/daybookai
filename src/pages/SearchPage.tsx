import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search as SearchIcon, Filter, X } from 'lucide-react';
import { db, getAllTags } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EntryCard } from '@/components/EntryCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function SearchContent() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const allTags = useLiveQuery(() => getAllTags(), []);
  const allEntries = useLiveQuery(() => db.entries.orderBy('createdAt').reverse().toArray());

  const filteredEntries = useMemo(() => {
    if (!allEntries) return [];
    
    let results = allEntries;

    // Filter by search query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(entry => 
        entry.text.toLowerCase().includes(lowerQuery) ||
        entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // Filter by selected tags
    if (selectedTags.length > 0) {
      results = results.filter(entry =>
        selectedTags.some(tag => entry.tags.includes(tag))
      );
    }

    return results;
  }, [allEntries, query, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setQuery('');
    setSelectedTags([]);
  };

  const hasFilters = query.trim() || selectedTags.length > 0;

  return (
    <div className="min-h-screen pb-24 cyber-noise rune-grid">
      <header className="sticky top-0 z-40 space-y-3 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border/50">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <SearchIcon className="h-6 w-6 text-cyber-sigil" />
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
        
        {/* Search input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="pl-10 bg-muted/50 border-border/50"
            />
          </div>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="hover:bg-cyber-glow/10"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters panel */}
        {showFilters && allTags && allTags.length > 0 && (
          <div className="animate-fade-in space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('search.filterByTags')}</span>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs hover:bg-cyber-glow/10">
                  {t('search.reset')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm transition-all',
                    selectedTags.includes(tag)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {tag}
                  {selectedTags.includes(tag) && <X className="ml-1 inline h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Rune divider */}
        <div className="mt-2 rune-divider">
          <span className="sigil-separator">◆</span>
        </div>
      </header>

      <main className="px-4 pt-4">
        {!allEntries ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 p-6 panel-glass">
              <SearchIcon className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-serif font-medium">
              {hasFilters ? t('search.noResults') : t('search.noEntries')}
            </h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              {hasFilters
                ? t('search.noResultsHint')
                : t('search.noEntriesHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('search.found')}: {filteredEntries.length}
            </p>
            {filteredEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} showDate />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <ErrorBoundary>
      <SearchContent />
    </ErrorBoundary>
  );
}
