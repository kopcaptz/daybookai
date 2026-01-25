import { useMemo } from 'react';
import { X, Image, Video, Mic, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize, formatDuration } from '@/lib/mediaUtils';
import { cn } from '@/lib/utils';

export interface AttachmentPreview {
  tempId: string;
  kind: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  duration?: number;
  blob: Blob;
  thumbnail?: Blob;
}

interface AttachmentListProps {
  attachments: AttachmentPreview[];
  onRemove: (tempId: string) => void;
  disabled?: boolean;
}

export function AttachmentList({ attachments, onRemove, disabled }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Вложения ({attachments.length})</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <AttachmentItem
            key={attachment.tempId}
            attachment={attachment}
            onRemove={() => onRemove(attachment.tempId)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

interface AttachmentItemProps {
  attachment: AttachmentPreview;
  onRemove: () => void;
  disabled?: boolean;
}

function AttachmentItem({ attachment, onRemove, disabled }: AttachmentItemProps) {
  const previewUrl = useMemo(() => {
    if (attachment.kind === 'image') {
      return URL.createObjectURL(attachment.blob);
    }
    if (attachment.kind === 'video' && attachment.thumbnail) {
      return URL.createObjectURL(attachment.thumbnail);
    }
    return null;
  }, [attachment]);

  const getIcon = () => {
    switch (attachment.kind) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Mic className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    const size = formatFileSize(attachment.size);
    if (attachment.duration) {
      return `${size} • ${formatDuration(attachment.duration)}`;
    }
    return size;
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card">
      {previewUrl ? (
        <div className="relative h-20 w-20">
          <img
            src={previewUrl}
            alt="Preview"
            className="h-full w-full object-cover"
            onLoad={() => URL.revokeObjectURL(previewUrl)}
          />
          {attachment.kind === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="h-6 w-6 text-white" fill="white" />
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
          {getIcon()}
          <span className="text-center text-[10px] leading-tight">{getLabel()}</span>
        </div>
      )}

      {/* Remove button */}
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className={cn(
          'absolute -right-1 -top-1 h-5 w-5 rounded-full opacity-0 shadow-md transition-opacity',
          'group-hover:opacity-100',
          disabled && 'pointer-events-none'
        )}
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="h-3 w-3" />
      </Button>

      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
        <p className="text-[10px] text-white">{getLabel()}</p>
      </div>
    </div>
  );
}
