import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Lock, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiaryEntry } from '@/lib/db';
import { MoodBadge } from './MoodSelector';
import { TagBadge } from './TagSelector';
import { SyncIndicator } from './SyncIndicator';
import { useI18n } from '@/lib/i18n';

interface EntryCardProps {
  entry: DiaryEntry;
  showDate?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
}

export function EntryCard({ entry, showDate = false, selectable = false, selected = false, onSelect }: EntryCardProps) {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const navigate = useNavigate();
  
  const timeFormatted = format(new Date(entry.createdAt), 'HH:mm', { locale });
  const dateFormatted = showDate 
    ? format(new Date(entry.date), 'd MMM', { locale })
    : null;

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onSelect && entry.id) {
      e.preventDefault();
      onSelect(entry.id);
    }
  };

  const hasSelection = () => {
    const selection = window.getSelection?.();
    return selection && selection.type === 'Range' && selection.toString().trim().length > 0;
  };

  const handleOpen = () => {
    if (!entry.id || hasSelection()) return;
    navigate(`/entry/${entry.id}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  const content = (
    <div className="grimoire-card relative overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-cyber-glow/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="flex items-start gap-3">
        {/* Selection checkbox */}
        {selectable && (
          <div 
            className={cn(
              "shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-all duration-200",
              selected 
                ? "bg-primary border-primary text-primary-foreground" 
                : "border-muted-foreground/40 hover:border-primary/60"
            )}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        )}
        
        {/* Mood indicator */}
        <div className="shrink-0 pt-0.5">
          <MoodBadge mood={entry.mood} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row (if exists) */}
          {entry.title && (
            <h4 className="text-sm font-medium text-foreground mb-1 line-clamp-1 select-text">
              {entry.title}
              {entry.titleSource === 'ai' && (
                <span className="ms-1 text-xs text-cyber-glow/60">✨</span>
              )}
            </h4>
          )}
          
          {/* Time & date row */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
            <span className="font-mono">{timeFormatted}</span>
            {dateFormatted && (
              <>
                <span className="text-cyber-sigil/30">•</span>
                <span>{dateFormatted}</span>
              </>
            )}
            {entry.isPrivate && (
              <Lock className="h-3 w-3 ms-auto text-cyber-rune/60" />
            )}
            <SyncIndicator />
          </div>
          
          {/* Text preview */}
          <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed select-text">
            {entry.text || (
              <span className="text-muted-foreground italic">{t('entry.empty')}</span>
            )}
          </p>
          
          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {entry.tags.slice(0, 3).map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
              {entry.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{entry.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Arrow indicator (hidden in select mode) */}
        {!selectable && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-cyber-sigil/70 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 transition-all duration-200 shrink-0 mt-1" />
        )}
      </div>
    </div>
  );

  if (selectable) {
    return (
      <div 
        onClick={handleClick}
        className={cn(
          "block group cursor-pointer",
          selected && "ring-2 ring-primary/50 rounded-lg"
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="block group cursor-pointer"
    >
      {content}
    </div>
  );
}
