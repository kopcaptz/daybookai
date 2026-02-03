import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Pin, User, Clock } from 'lucide-react';
import { EtherealChronicle } from '@/lib/etherealDb';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n, getBaseLanguage } from '@/lib/i18n';

const texts = {
  noTitle: { ru: 'Без названия', en: 'Untitled' },
  edited: { ru: 'ред.', en: 'ed.' },
  editing: { ru: 'редактирует', en: 'is editing' },
  someone: { ru: 'Кто-то', en: 'Someone' },
} as const;

interface ChronicleCardProps {
  chronicle: EtherealChronicle;
  onClick: () => void;
}

export function ChronicleCard({ chronicle, onClick }: ChronicleCardProps) {
  const { language } = useI18n();
  const lang = getBaseLanguage(language);
  const t = (key: keyof typeof texts) => texts[key][lang];
  const dateLocale = lang === 'ru' ? ru : enUS;

  const preview = chronicle.content.slice(0, 120).replace(/\n/g, ' ');
  const hasMore = chronicle.content.length > 120;
  
  const authorDisplay = chronicle.updatedByName 
    ? `${chronicle.updatedByName} (${t('edited')})` 
    : chronicle.authorName;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-lg border transition-all duration-200',
        'bg-card hover:bg-accent/50 hover:border-primary/30',
        'focus:outline-none focus:ring-2 focus:ring-primary/50',
        chronicle.pinned && 'border-amber-500/50 bg-amber-500/5'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-base line-clamp-1 flex-1">
          {chronicle.title || t('noTitle')}
        </h3>
        {chronicle.pinned && (
          <Pin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        )}
      </div>

      {preview && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {preview}{hasMore && '...'}
        </p>
      )}

      {chronicle.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {chronicle.tags.slice(0, 3).map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs px-2 py-0">
              {tag}
            </Badge>
          ))}
          {chronicle.tags.length > 3 && (
            <Badge variant="outline" className="text-xs px-2 py-0">
              +{chronicle.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {authorDisplay}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span dir="ltr">{format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: dateLocale })}</span>
        </span>
      </div>

      {chronicle.editingBy && chronicle.editingExpiresAt && chronicle.editingExpiresAt > Date.now() && (
        <div className="mt-2 text-xs text-amber-600 bg-amber-500/10 px-2 py-1 rounded">
          ✏️ {chronicle.editingByName || t('someone')} {t('editing')}
        </div>
      )}
    </button>
  );
}
