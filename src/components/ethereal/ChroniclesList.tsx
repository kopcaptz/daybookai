import { useState, useMemo } from 'react';
import { Search, Plus, Pin, BookOpen, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EtherealChronicle } from '@/lib/etherealDb';
import { ChronicleCard } from './ChronicleCard';
import { cn } from '@/lib/utils';

interface ChroniclesListProps {
  chronicles: EtherealChronicle[];
  loading: boolean;
  onSelect: (chronicle: EtherealChronicle) => void;
  onCreate: () => void;
  onRefresh: () => void;
}

export function ChroniclesList({ chronicles, loading, onSelect, onCreate, onRefresh }: ChroniclesListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return chronicles;
    const q = search.toLowerCase();
    return chronicles.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [chronicles, search]);

  const pinned = filtered.filter((c) => c.pinned);
  const regular = filtered.filter((c) => !c.pinned);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по записям..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={onCreate} className="flex-1 gap-2">
            <Plus className="w-4 h-4" />
            Новая запись
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className={cn(loading && 'animate-spin')}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Empty state */}
        {chronicles.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">Библиотека пуста</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Создайте первую запись, чтобы начать вести совместный журнал вашей команды.
            </p>
          </div>
        )}

        {/* No results */}
        {chronicles.length > 0 && filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Ничего не найдено
          </div>
        )}

        {/* Pinned section */}
        {pinned.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-amber-600">
              <Pin className="w-4 h-4" />
              Закреплённые
            </div>
            <div className="space-y-2">
              {pinned.map((c) => (
                <ChronicleCard key={c.serverId} chronicle={c} onClick={() => onSelect(c)} />
              ))}
            </div>
          </div>
        )}

        {/* Regular chronicles */}
        {regular.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Все записи
              </div>
            )}
            <div className="space-y-2">
              {regular.map((c) => (
                <ChronicleCard key={c.serverId} chronicle={c} onClick={() => onSelect(c)} />
              ))}
            </div>
          </div>
        )}

        {loading && chronicles.length === 0 && (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
