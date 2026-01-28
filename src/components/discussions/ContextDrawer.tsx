import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { X, Plus, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiaryEntry, db } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryIds: number[];
  docIds: number[];
  onAddFromToday?: () => void;
  onRemoveEntry?: (id: number) => void;
}

export function ContextDrawer({
  open,
  onOpenChange,
  entryIds,
  docIds,
  onAddFromToday,
  onRemoveEntry,
}: ContextDrawerProps) {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  
  useEffect(() => {
    async function loadEntries() {
      const loaded: DiaryEntry[] = [];
      for (const id of entryIds) {
        const entry = await db.entries.get(id);
        if (entry) loaded.push(entry);
      }
      setEntries(loaded);
    }
    loadEntries();
  }, [entryIds]);
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="px-4 py-3 border-b border-border/50">
          <SheetTitle className="text-base">{t('discussion.context')}</SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="p-4 space-y-4">
            {/* Entries section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {language === 'ru' ? 'Записи' : 'Entries'} ({entryIds.length})
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddFromToday}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {t('discussion.addFromToday')}
                </Button>
              </div>
              
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {language === 'ru' ? 'Нет записей' : 'No entries selected'}
                </p>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 group"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-muted-foreground">
                          {format(new Date(entry.date), 'd MMM', { locale })} @ {format(new Date(entry.createdAt), 'HH:mm')}
                        </p>
                        <p className="text-sm text-foreground line-clamp-2 mt-0.5">
                          {entry.text || (language === 'ru' ? 'Пустая запись' : 'Empty entry')}
                        </p>
                      </div>
                      {onRemoveEntry && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => onRemoveEntry(entry.id!)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Documents section (placeholder) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {language === 'ru' ? 'Документы' : 'Documents'} ({docIds.length})
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled
                  className="h-7 text-xs gap-1 opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  {language === 'ru' ? 'Добавить' : 'Add'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground py-4 text-center">
                {language === 'ru' ? 'Документы скоро' : 'Documents coming soon'}
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
