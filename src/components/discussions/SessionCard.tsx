import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Pin, ChevronRight, Trash2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiscussionSession } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { getScopeCountText } from '@/lib/librarian/contextPack';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface SessionCardProps {
  session: DiscussionSession;
  onPin?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export function SessionCard({ session, onPin, onDelete }: SessionCardProps) {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  
  const timeAgo = formatDistanceToNow(new Date(session.lastMessageAt), {
    addSuffix: true,
    locale,
  });
  
  const scopeText = getScopeCountText(
    session.scope.entryIds,
    session.scope.docIds,
    language as 'ru' | 'en'
  );
  
  return (
    <div className="grimoire-card relative overflow-hidden group">
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-cyber-glow/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <Link 
        to={`/discussions/${session.id}`}
        className="flex items-start gap-3 flex-1"
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
        
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-cyber-sigil/70 group-hover:translate-x-0.5 transition-all duration-200 shrink-0 mt-1" />
      </Link>
      
      {/* Actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onPin?.(session.id!)}>
            <Pin className="h-4 w-4 mr-2" />
            {session.pinned ? t('discussions.unpin') : t('discussions.pin')}
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onDelete?.(session.id!)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('discussions.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
