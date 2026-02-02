import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EtherealChronicle } from '@/lib/etherealDb';
import { cn } from '@/lib/utils';

interface ChronicleEditorProps {
  chronicle?: EtherealChronicle | null;
  onSave: (data: { title: string; content: string; tags: string[] }) => Promise<void>;
  onCancel: () => void;
  lockRefresh?: () => Promise<boolean>;
  isLocked?: boolean;
  lockedByName?: string;
}

export function ChronicleEditor({
  chronicle,
  onSave,
  onCancel,
  lockRefresh,
  isLocked,
  lockedByName,
}: ChronicleEditorProps) {
  const [title, setTitle] = useState(chronicle?.title || '');
  const [content, setContent] = useState(chronicle?.content || '');
  const [tags, setTags] = useState<string[]>(chronicle?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  const lockIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Lock refresh every 30 seconds
  useEffect(() => {
    if (lockRefresh && chronicle) {
      lockIntervalRef.current = setInterval(async () => {
        const success = await lockRefresh();
        if (!success) {
          // Lock lost - could show warning
          console.warn('[ChronicleEditor] Lock refresh failed');
        }
      }, 30000);

      return () => {
        if (lockIntervalRef.current) {
          clearInterval(lockIntervalRef.current);
        }
      };
    }
  }, [lockRefresh, chronicle]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content, tags });
    } finally {
      setSaving(false);
    }
  }, [title, content, tags, onSave]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
    setShowTagInput(false);
  }, [tagInput, tags]);

  const removeTag = useCallback((index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  }, [tags]);

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Escape') {
      setShowTagInput(false);
      setTagInput('');
    }
  };

  const isNew = !chronicle;
  const hasChanges = title !== (chronicle?.title || '') || 
                     content !== (chronicle?.content || '') ||
                     JSON.stringify(tags) !== JSON.stringify(chronicle?.tags || []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-medium flex-1">
          {isNew ? 'Новая запись' : 'Редактирование'}
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1">
          <X className="w-4 h-4" />
          Отмена
        </Button>
        <Button
          onClick={handleSave}
          disabled={!title.trim() || saving || isLocked}
          className="gap-1"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>

      {/* Locked warning */}
      {isLocked && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm">
          ⚠️ <strong>{lockedByName || 'Другой пользователь'}</strong> взял запись в редактирование. 
          Ваши изменения могут быть потеряны.
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <Input
            placeholder="Заголовок записи"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-medium"
            autoFocus={isNew}
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive/20"
                onClick={() => removeTag(i)}
              >
                {tag} ×
              </Badge>
            ))}
            {!showTagInput && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTagInput(true)}
                className="h-6 px-2 text-xs gap-1"
              >
                <Tag className="w-3 h-3" />
                Добавить тег
              </Button>
            )}
          </div>
          {showTagInput && (
            <div className="flex gap-2">
              <Input
                placeholder="Введите тег..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                autoFocus
                className="h-8 text-sm"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1">
          <Textarea
            placeholder="Содержимое записи..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={cn(
              'min-h-[300px] resize-none',
              'bg-gradient-to-b from-amber-50/30 to-transparent',
              'dark:from-amber-950/10 dark:to-transparent'
            )}
          />
        </div>

        {/* Unsaved changes indicator */}
        {hasChanges && !isNew && (
          <p className="text-xs text-muted-foreground">
            Есть несохранённые изменения
          </p>
        )}
      </div>
    </div>
  );
}
