import { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface TagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  allTags?: string[];
}

export function TagSelector({ value, onChange, allTags = [] }: TagSelectorProps) {
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

  return (
    <div className="space-y-3 panel-glass p-4">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-cyber-sigil" />
        <span className="text-sm font-medium">{t('tags.title')}</span>
      </div>
      
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