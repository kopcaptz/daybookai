import { useState, useEffect, useMemo } from "react";
import { Search, Calendar, FileText, Check } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, parseISO } from "date-fns";
import { db, type DiaryEntry } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LinkEntrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptDate: string | null;
  currentEntryId: number | null;
  onSelect: (entryId: number) => void;
}

export function LinkEntrySheet({
  open,
  onOpenChange,
  receiptDate,
  currentEntryId,
  onSelect,
}: LinkEntrySheetProps) {
  const { language } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Get all entries (last 30)
  const recentEntries = useLiveQuery(
    () => db.entries.orderBy("createdAt").reverse().limit(30).toArray(),
    []
  );
  
  // Get entries for receipt date
  const sameDayEntries = useLiveQuery(
    () => {
      if (!receiptDate) return [];
      return db.entries.where("date").equals(receiptDate).toArray();
    },
    [receiptDate]
  );
  
  // Filter by search query
  const filteredEntries = useMemo(() => {
    if (!recentEntries) return [];
    
    if (!searchQuery.trim()) {
      return recentEntries;
    }
    
    const query = searchQuery.toLowerCase();
    return recentEntries.filter(entry =>
      entry.text.toLowerCase().includes(query) ||
      entry.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [recentEntries, searchQuery]);
  
  // Reset search when closed
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);
  
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), language === "ru" ? "d MMM yyyy" : "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };
  
  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };
  
  const handleSelect = (entryId: number) => {
    onSelect(entryId);
    onOpenChange(false);
  };
  
  const renderEntryItem = (entry: DiaryEntry, isSuggested: boolean = false) => {
    const isSelected = entry.id === currentEntryId;
    
    return (
      <button
        key={entry.id}
        onClick={() => handleSelect(entry.id!)}
        className={cn(
          "w-full text-left p-3 rounded-lg transition-colors",
          "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50",
          isSelected && "bg-primary/10 border border-primary/30",
          isSuggested && "border border-cyber-sigil/30"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(entry.date)}</span>
              {isSuggested && (
                <span className="px-1.5 py-0.5 rounded bg-cyber-sigil/20 text-cyber-sigil text-[10px]">
                  {language === "ru" ? "тот же день" : "same day"}
                </span>
              )}
            </div>
            <p className="text-sm truncate">
              {truncateText(entry.text) || (language === "ru" ? "Пустая запись" : "Empty entry")}
            </p>
          </div>
          {isSelected && (
            <Check className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
          )}
        </div>
      </button>
    );
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] panel-glass">
        <SheetHeader className="text-left">
          <SheetTitle>
            {language === "ru" ? "Привязать к записи" : "Link to Entry"}
          </SheetTitle>
          <SheetDescription>
            {language === "ru"
              ? "Выберите запись дневника для привязки чека"
              : "Select a diary entry to link this receipt"}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === "ru" ? "Поиск по записям..." : "Search entries..."}
              className="pl-9"
            />
          </div>
          
          <ScrollArea className="h-[calc(80vh-200px)]">
            <div className="space-y-4 pr-4">
              {/* Same day entries */}
              {sameDayEntries && sameDayEntries.length > 0 && !searchQuery && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    {language === "ru" ? "Записи за тот же день" : "Same day entries"}
                  </h4>
                  <div className="space-y-1">
                    {sameDayEntries.map(entry => renderEntryItem(entry, true))}
                  </div>
                </div>
              )}
              
              {/* Recent/filtered entries */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  {searchQuery
                    ? language === "ru" ? "Результаты поиска" : "Search results"
                    : language === "ru" ? "Недавние записи" : "Recent entries"}
                </h4>
                <div className="space-y-1">
                  {filteredEntries?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {language === "ru" ? "Записи не найдены" : "No entries found"}
                      </p>
                    </div>
                  ) : (
                    filteredEntries?.map(entry => renderEntryItem(entry))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
