import { Link } from 'react-router-dom';
import { formatDistanceToNow, Locale } from 'date-fns';
import { ru, enUS, he, ar } from 'date-fns/locale';
import { Pin, ChevronRight, Trash2 } from 'lucide-react';
import { DiscussionSession } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { getScopeCountText } from '@/lib/librarian/contextPack';
import { Button } from '@/components/ui/button';

const localeMap: Record<string, Locale> = { ru, en: enUS, he, ar };

interface SessionCardProps {
  session: DiscussionSession;
  onPin?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export function SessionCard({ session, onPin, onDelete }: SessionCardProps) {
  const { t, language } = useI18n();
  const locale = localeMap[language] || enUS;
  
  const timeAgo = formatDistanceToNow(new Date(session.lastMessageAt), {
    addSuffix: true,
    locale,
  });
  
  const scopeText = getScopeCountText(
    session.scope.entryIds,
    session.scope.docIds,
    language
  );
  
  return (
    <div className="grimoire-card relative overflow-hidden group">
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-cyber-glow/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <Link 
        to={`/discussions/${session.id}`}
        className="flex items-center gap-3 flex-1"
      >
        <div className="flex-1 min-w-0">
          {/* Title row with pin */}
          <div className="flex items-center gap-2">
            {session.pinned && (
              <Pin className="h-3 w-3 text-cyber-sigil shrink-0" />
            )}
            <h3 className="font-medium text-foreground truncate">
              {session.title}
            </h3>
          </div>
          
          {/* Meta row */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="font-mono">{timeAgo}</span>
            <span className="text-cyber-sigil/30">•</span>
            <span>{scopeText}</span>
          </div>
        </div>
        
        {/* Delete button - always visible */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete?.(session.id!);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-cyber-sigil/70 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:rotate-180 transition-all duration-200 shrink-0" />
      </Link>
    </div>
  );
}
