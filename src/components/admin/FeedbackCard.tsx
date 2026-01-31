import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  Eye, 
  CheckCircle, 
  Archive, 
  MessageSquare, 
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Monitor,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface FeedbackItem {
  id: string;
  message: string;
  image_url: string | null;
  image_signed_url: string | null;
  device_info: {
    userAgent?: string;
    language?: string;
    viewport?: { width: number; height: number };
    timestamp?: string;
  };
  status: 'new' | 'read' | 'resolved' | 'archived';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface FeedbackCardProps {
  item: FeedbackItem;
  onUpdateStatus: (id: string, status: FeedbackItem['status']) => Promise<void>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onImageClick: (url: string) => void;
}

const statusConfig = {
  new: { label: 'Новое', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  read: { label: 'Прочитано', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  resolved: { label: 'Решено', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  archived: { label: 'В архиве', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

export function FeedbackCard({ item, onUpdateStatus, onUpdateNotes, onImageClick }: FeedbackCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(item.admin_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleStatusChange = async (status: FeedbackItem['status']) => {
    setIsUpdatingStatus(true);
    try {
      await onUpdateStatus(item.id, status);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (notes === item.admin_notes) return;
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(item.id, notes);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const status = statusConfig[item.status];

  return (
    <div className={cn(
      "rounded-lg border",
      "bg-card/60 backdrop-blur-sm",
      "border-border/50",
      "transition-all duration-200",
      item.status === 'new' && "border-l-4 border-l-blue-500"
    )}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-accent/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={cn("text-xs", status.color)}>
                {status.label}
              </Badge>
              {item.image_url && (
                <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/30">
                  <ImageIcon className="h-3 w-3 mr-1" />
                  Фото
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {format(new Date(item.created_at), 'd MMM yyyy, HH:mm', { locale: ru })}
              </span>
            </div>
            <p className={cn(
              "text-sm text-foreground",
              !isExpanded && "line-clamp-2"
            )}>
              {item.message}
            </p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/30 pt-4">
          {/* Image preview */}
          {item.image_signed_url && (
            <div 
              className="relative w-full max-w-xs rounded-lg overflow-hidden border border-border/50 cursor-pointer group"
              onClick={() => onImageClick(item.image_signed_url!)}
            >
              <img 
                src={item.image_signed_url} 
                alt="Прикреплённое изображение"
                className="w-full h-auto object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Eye className="h-6 w-6 text-white" />
              </div>
            </div>
          )}

          {/* Device info */}
          {item.device_info && Object.keys(item.device_info).length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="h-3 w-3" />
              <span>
                {item.device_info.viewport && `${item.device_info.viewport.width}×${item.device_info.viewport.height}`}
                {item.device_info.language && ` • ${item.device_info.language}`}
              </span>
            </div>
          )}

          {/* Admin notes */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Заметки
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Добавить заметку..."
              className="min-h-[60px] resize-none text-sm bg-background/50"
            />
            {notes !== item.admin_notes && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
              >
                {isSavingNotes && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Сохранить
              </Button>
            )}
          </div>

          {/* Status actions */}
          <div className="flex flex-wrap gap-2">
            {item.status !== 'read' && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleStatusChange('read')}
                disabled={isUpdatingStatus}
                className="gap-1"
              >
                <Eye className="h-3 w-3" />
                Прочитано
              </Button>
            )}
            {item.status !== 'resolved' && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleStatusChange('resolved')}
                disabled={isUpdatingStatus}
                className="gap-1 text-green-400 hover:text-green-300"
              >
                <CheckCircle className="h-3 w-3" />
                Решено
              </Button>
            )}
            {item.status !== 'archived' && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleStatusChange('archived')}
                disabled={isUpdatingStatus}
                className="gap-1 text-muted-foreground"
              >
                <Archive className="h-3 w-3" />
                В архив
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
