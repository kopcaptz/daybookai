import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowLeft, Pin, Edit, User, Clock, Share2 } from 'lucide-react';
import { EtherealChronicle } from '@/lib/etherealDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChronicleViewProps {
  chronicle: EtherealChronicle;
  onBack: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
}

export function ChronicleView({ chronicle, onBack, onEdit, onTogglePin }: ChronicleViewProps) {
  const isLocked = chronicle.editingBy && chronicle.editingExpiresAt && chronicle.editingExpiresAt > Date.now();

  // Render content with media placeholders
  const renderContent = (content: string) => {
    // Replace [[img:path]] with actual images
    const mediaMap = new Map(chronicle.media.map((m) => [m.path, m.signedUrl]));
    
    const parts = content.split(/\[\[img:([^\]]+)\]\]/g);
    
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // This is a path
        const url = mediaMap.get(part);
        if (url) {
          return (
            <img
              key={i}
              src={url}
              alt=""
              className="rounded-lg max-w-full my-4"
              loading="lazy"
            />
          );
        }
        return null;
      }
      // Regular text - preserve line breaks
      return part.split('\n').map((line, j) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < part.split('\n').length - 1 && <br />}
        </span>
      ));
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onTogglePin}
          className={cn(chronicle.pinned && 'text-amber-500')}
        >
          <Pin className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" disabled>
          <Share2 className="w-5 h-5" />
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onEdit}
          disabled={!!isLocked}
          className="gap-1"
        >
          <Edit className="w-4 h-4" />
          Редактировать
        </Button>
      </div>

      {/* Lock banner */}
      {isLocked && (
        <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-sm">
          <span className="text-amber-600">✏️</span>
          <span>
            <strong>{chronicle.editingByName || 'Кто-то'}</strong> сейчас редактирует эту запись
          </span>
        </div>
      )}

      {/* Content - "parchment" style */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className={cn(
            'rounded-lg p-6 min-h-full',
            'bg-gradient-to-b from-amber-50/50 to-amber-100/30',
            'dark:from-amber-950/20 dark:to-amber-900/10',
            'border border-amber-200/50 dark:border-amber-800/30',
            'shadow-sm'
          )}
        >
          {/* Title */}
          <h1 className="text-2xl font-semibold mb-4 text-amber-950 dark:text-amber-100">
            {chronicle.title || 'Без названия'}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {chronicle.authorName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(chronicle.createdAtMs), 'd MMMM yyyy, HH:mm', { locale: ru })}
            </span>
            {chronicle.updatedByName && chronicle.updatedAtMs !== chronicle.createdAtMs && (
              <span className="text-xs opacity-70">
                (ред. {chronicle.updatedByName}, {format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: ru })})
              </span>
            )}
          </div>

          {/* Tags */}
          {chronicle.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-6">
              {chronicle.tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="prose prose-amber dark:prose-invert max-w-none whitespace-pre-wrap">
            {renderContent(chronicle.content)}
          </div>

          {/* Empty content */}
          {!chronicle.content.trim() && (
            <p className="text-muted-foreground italic">Нет содержимого</p>
          )}
        </div>
      </div>
    </div>
  );
}
