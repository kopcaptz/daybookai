import { useState } from 'react';
import { X, Plus, Tag, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { TagSuggestion } from '@/lib/autoTagService';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  allTags?: string[];
  // Auto-tag suggestions
  suggestedTags?: TagSuggestion[];
  onAcceptTag?: (tag: string) => void;
  onDismissTag?: (tag: string) => void;
  onAcceptAll?: () => void;
}

export function TagSelector({ 
  value, 
  onChange, 
  allTags = [],
  suggestedTags = [],
  onAcceptTag,
  onDismissTag,
  onAcceptAll,
}: TagSelectorProps) {
  const { t, language } = useI18n();
  const [newTag, setNewTag] = useState('');
  const [showInput, setShowInput] = useState(false);

  // Preset tags with translations
  const presetTags = language === 'ru' 
    ? ['Работа', 'Семья', 'Здоровье', 'Хобби', 'Друзья', 'Учёба', 'Отдых', 'Спорт']
    : ['Work', 'Family', 'Health', 'Hobby', 'Friends', 'Study', 'Rest', 'Sport'];

  // Combine preset tags with custom tags from history
  const availableTags = Array.from(new Set([...presetTags, ...allTags]));

  const toggleTag = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  const addCustomTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setNewTag('');
    setShowInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    } else if (e.key === 'Escape') {
      setShowInput(false);
      setNewTag('');
    }
  };

  const hasSuggestions = suggestedTags.length > 0;

  return (
    <div className="space-y-3 panel-glass p-4">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-cyber-sigil" />
        <span className="text-sm font-medium">{t('tags.title')}</span>
      </div>
      
      {/* Auto-tag suggestions */}
      {hasSuggestions && (
        <div className="rounded-lg border border-cyber-glow/30 bg-cyber-glow/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-cyber-glow">
              <Sparkles className="h-3 w-3" />
              <span>{t('tags.suggestions')}</span>
            </div>
            {suggestedTags.length > 1 && onAcceptAll && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onAcceptAll}
                className="h-6 px-2 text-xs text-cyber-glow hover:bg-cyber-glow/10"
              >
                <Check className="h-3 w-3 mr-1" />
                {t('tags.acceptAll')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedTags.map((suggestion) => (
              <TooltipProvider key={suggestion.tag}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 rounded-full border border-cyber-glow/40 bg-cyber-glow/10 px-2 py-1 animate-sigil-pulse">
                      <button
                        type="button"
                        onClick={() => onAcceptTag?.(suggestion.tag)}
                        className="flex items-center gap-1 text-sm text-cyber-glow hover:text-cyber-glow/80 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        {suggestion.tag}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDismissTag?.(suggestion.tag)}
                        className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {suggestion.source === 'emoji' ? '😀 ' : '🔤 '}
                      {Math.round(suggestion.confidence * 100)}% {t('tags.confidence')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition-all duration-200',
              value.includes(tag)
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary/50 text-secondary-foreground hover:bg-secondary border border-border/30'
            )}
          >
            {tag}
            {value.includes(tag) && (
              <X className="ml-1 inline-block h-3 w-3" />
            )}
          </button>
        ))}
        
        {showInput ? (
          <div className="flex items-center gap-1">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('tags.placeholder')}
              className="h-8 w-32 text-sm"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addCustomTag}
              className="h-8 px-2 hover:bg-muted/50"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1 rounded-full border-2 border-dashed border-cyber-glow/30 px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 hover:border-cyber-glow/50 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('tags.add')}
          </button>
        )}
      </div>
    </div>
  );
}

export function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex rounded-full bg-secondary/60 border border-border/30 px-2 py-0.5 text-xs text-secondary-foreground">
      {tag}
    </span>
  );
}