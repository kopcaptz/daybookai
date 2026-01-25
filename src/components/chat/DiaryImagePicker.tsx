import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, parseISO, subDays, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Image as ImageIcon, Calendar, Loader2, Search, X, FilterX, Check, ToggleLeft, ToggleRight } from 'lucide-react';
import { db, Attachment, DiaryEntry } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { compressChatImage } from '@/lib/chatImageUtils';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_MULTI_SELECT = 4;
const COLUMNS = 3;
const ROW_HEIGHT = 120; // px, approximate for aspect-square items

interface DiaryImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelect: (result: { blob: Blob; base64DataUrl: string }) => void;
  onMultiImageSelect?: (results: Array<{ blob: Blob; base64DataUrl: string }>) => void;
}

interface ImageWithMeta extends Attachment {
  entryDate?: string;
  entryText?: string;
  entryTags?: string[];
}

type DateFilterPreset = 'all' | '7days' | '30days' | 'custom';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function DiaryImagePicker({ open, onOpenChange, onImageSelect, onMultiImageSelect }: DiaryImagePickerProps) {
  const { language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Multi-select mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [showCustomDates, setShowCustomDates] = useState(false);
  
  const debouncedSearch = useDebounce(searchQuery, 200);
  
  // Virtualization refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Track ObjectURLs for cleanup - only for visible items
  const urlsRef = useRef<Map<number, string>>(new Map());
  const visibleIdsRef = useRef<Set<number>>(new Set());

  // Query last 200 image attachments (increased for virtualization)
  const attachments = useLiveQuery(async () => {
    const images = await db.attachments
      .where('kind')
      .equals('image')
      .reverse()
      .sortBy('createdAt');
    return images.slice(0, 200);
  }, [], []);

  // Query entries to get metadata
  const entries = useLiveQuery(async () => {
    if (!attachments || attachments.length === 0) return new Map<number, DiaryEntry>();
    
    const entryIds = [...new Set(attachments.map(a => a.entryId).filter(id => id > 0))];
    const entriesArr = await db.entries.where('id').anyOf(entryIds).toArray();
    
    return new Map(entriesArr.map(e => [e.id!, e]));
  }, [attachments], new Map());

  // Combine attachments with entry metadata
  const imagesWithMeta: ImageWithMeta[] = useMemo(() => {
    if (!attachments) return [];
    
    return attachments.map(att => {
      const entry = entries.get(att.entryId);
      return {
        ...att,
        entryDate: entry?.date,
        entryText: entry?.text?.slice(0, 100),
        entryTags: entry?.tags,
      };
    });
  }, [attachments, entries]);

  // Filter images by search and date
  const filteredImages = useMemo(() => {
    let result = imagesWithMeta;
    
    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      
      if (dateFilter === '7days') {
        const cutoff = subDays(now, 7);
        result = result.filter(img => {
          if (!img.entryDate) return false;
          try {
            return isAfter(parseISO(img.entryDate), startOfDay(cutoff));
          } catch {
            return false;
          }
        });
      } else if (dateFilter === '30days') {
        const cutoff = subDays(now, 30);
        result = result.filter(img => {
          if (!img.entryDate) return false;
          try {
            return isAfter(parseISO(img.entryDate), startOfDay(cutoff));
          } catch {
            return false;
          }
        });
      } else if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        try {
          const start = startOfDay(parseISO(customDateStart));
          const end = endOfDay(parseISO(customDateEnd));
          result = result.filter(img => {
            if (!img.entryDate) return false;
            try {
              const entryD = parseISO(img.entryDate);
              return isAfter(entryD, start) && isBefore(entryD, end);
            } catch {
              return false;
            }
          });
        } catch {
          // Invalid dates
        }
      }
    }
    
    // Text search
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase().trim();
      result = result.filter(img => {
        const textMatch = img.entryText?.toLowerCase().includes(query);
        const tagMatch = img.entryTags?.some(tag => tag.toLowerCase().includes(query));
        const dateMatch = img.entryDate?.includes(query);
        return textMatch || tagMatch || dateMatch;
      });
    }
    
    return result;
  }, [imagesWithMeta, dateFilter, debouncedSearch, customDateStart, customDateEnd]);

  // Group into rows for virtualization
  const rows = useMemo(() => {
    const result: ImageWithMeta[][] = [];
    for (let i = 0; i < filteredImages.length; i += COLUMNS) {
      result.push(filteredImages.slice(i, i + COLUMNS));
    }
    return result;
  }, [filteredImages]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 2,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Get visible image IDs
  const visibleImageIds = useMemo(() => {
    const ids = new Set<number>();
    virtualRows.forEach(vRow => {
      const row = rows[vRow.index];
      row?.forEach(img => {
        if (img.id) ids.add(img.id);
      });
    });
    return ids;
  }, [virtualRows, rows]);

  // Manage ObjectURLs for visible items only
  useEffect(() => {
    if (!open) return;

    // Create URLs for newly visible items
    visibleImageIds.forEach(id => {
      if (!urlsRef.current.has(id)) {
        const img = filteredImages.find(i => i.id === id);
        if (img) {
          urlsRef.current.set(id, URL.createObjectURL(img.blob));
        }
      }
    });

    // Revoke URLs for items no longer visible (with buffer)
    const idsToRevoke: number[] = [];
    urlsRef.current.forEach((url, id) => {
      if (!visibleImageIds.has(id)) {
        idsToRevoke.push(id);
      }
    });
    
    // Keep some buffer to avoid flickering during fast scroll
    if (idsToRevoke.length > 20) {
      idsToRevoke.slice(0, idsToRevoke.length - 10).forEach(id => {
        const url = urlsRef.current.get(id);
        if (url) {
          URL.revokeObjectURL(url);
          urlsRef.current.delete(id);
        }
      });
    }

    visibleIdsRef.current = visibleImageIds;
  }, [open, visibleImageIds, filteredImages]);

  // Cleanup on close/unmount
  useEffect(() => {
    return () => {
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current.clear();
      // Reset state on close
      setSearchQuery('');
      setDateFilter('all');
      setCustomDateStart('');
      setCustomDateEnd('');
      setShowCustomDates(false);
      setMultiSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [open]);

  // Toggle selection
  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_MULTI_SELECT) {
          toast.error(language === 'ru' 
            ? `Максимум ${MAX_MULTI_SELECT} фото` 
            : `Maximum ${MAX_MULTI_SELECT} photos`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, [language]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Handle single select (existing behavior)
  const handleSingleSelect = async (attachment: Attachment) => {
    if (isProcessing || !attachment.id) return;
    
    setIsProcessing(true);

    try {
      const result = await compressChatImage(attachment.blob);
      
      if (result.success === false) {
        const errorMessages: Record<string, string> = {
          image_too_large: language === 'ru' ? 'Изображение слишком большое' : 'Image too large',
          invalid_image: language === 'ru' ? 'Не удалось загрузить' : 'Failed to load',
          compression_failed: language === 'ru' ? 'Ошибка сжатия' : 'Compression failed',
        };
        toast.error(errorMessages[result.error] || result.message);
        return;
      }

      onImageSelect({ blob: result.blob, base64DataUrl: result.base64DataUrl });
      onOpenChange(false);
    } catch (error) {
      console.error('Image processing failed:', error);
      toast.error(language === 'ru' ? 'Ошибка обработки' : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle multi-select confirm
  const handleMultiSelectConfirm = async () => {
    if (selectedIds.size === 0 || isProcessing) return;
    if (!onMultiImageSelect) {
      // Fallback: just use single select for first image
      const firstId = [...selectedIds][0];
      const img = filteredImages.find(i => i.id === firstId);
      if (img) await handleSingleSelect(img);
      return;
    }

    setIsProcessing(true);
    const results: Array<{ blob: Blob; base64DataUrl: string }> = [];
    const selectedImages = filteredImages.filter(img => img.id && selectedIds.has(img.id));
    
    try {
      // Sequential compression to avoid memory pressure
      for (let i = 0; i < selectedImages.length; i++) {
        setProcessingProgress({ current: i + 1, total: selectedImages.length });
        
        const result = await compressChatImage(selectedImages[i].blob);
        if (result.success) {
          results.push({ blob: result.blob, base64DataUrl: result.base64DataUrl });
        } else {
          toast.error(`${language === 'ru' ? 'Ошибка' : 'Error'} ${i + 1}/${selectedImages.length}`);
        }
      }

      if (results.length > 0) {
        onMultiImageSelect(results);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Multi-image processing failed:', error);
      toast.error(language === 'ru' ? 'Ошибка обработки' : 'Processing failed');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  const getPreviewUrl = (attachmentId: number): string | undefined => {
    return urlsRef.current.get(attachmentId);
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'd MMM', { locale });
    } catch {
      return dateStr;
    }
  };

  const handleDateFilterChange = (preset: DateFilterPreset) => {
    setDateFilter(preset);
    if (preset === 'custom') {
      setShowCustomDates(true);
    } else {
      setShowCustomDates(false);
      setCustomDateStart('');
      setCustomDateEnd('');
    }
  };

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setDateFilter('all');
    setCustomDateStart('');
    setCustomDateEnd('');
    setShowCustomDates(false);
  }, []);

  // Labels
  const labels = {
    title: language === 'ru' ? 'Фото из дневника' : 'Photos from diary',
    subtitle: language === 'ru' ? 'Выберите фото для отправки' : 'Select photos to send',
    searchPlaceholder: language === 'ru' ? 'Поиск...' : 'Search...',
    all: language === 'ru' ? 'Все' : 'All',
    days7: language === 'ru' ? '7 дн' : '7d',
    days30: language === 'ru' ? '30 дн' : '30d',
    custom: language === 'ru' ? 'Даты' : 'Dates',
    noPhotos: language === 'ru' ? 'Нет фото' : 'No photos',
    noResults: language === 'ru' ? 'Не найдено' : 'Not found',
    resetFilters: language === 'ru' ? 'Сбросить' : 'Reset',
    from: language === 'ru' ? 'От' : 'From',
    to: language === 'ru' ? 'До' : 'To',
    multiSelect: language === 'ru' ? 'Несколько' : 'Multi',
    selected: language === 'ru' ? 'Выбрано' : 'Selected',
    attach: language === 'ru' ? 'Прикрепить' : 'Attach',
    clear: language === 'ru' ? 'Очистить' : 'Clear',
    processing: language === 'ru' ? 'Обработка' : 'Processing',
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-xl flex flex-col">
        <SheetHeader className="pb-2 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-cyber-sigil" />
            {labels.title}
          </SheetTitle>
          <SheetDescription>{labels.subtitle}</SheetDescription>
        </SheetHeader>

        {/* Search + Multi-select toggle */}
        <div className="flex gap-2 mb-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={labels.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9 bg-muted/30 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {/* Multi-select toggle */}
          <Button
            variant={multiSelectMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMultiSelectMode(!multiSelectMode);
              if (multiSelectMode) clearSelection();
            }}
            className={cn(
              "gap-1.5 h-9 px-3",
              multiSelectMode && "bg-cyber-sigil hover:bg-cyber-sigil/90"
            )}
          >
            {multiSelectMode ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            <span className="text-xs">{labels.multiSelect}</span>
          </Button>
        </div>

        {/* Date filter presets */}
        <div className="flex gap-1 mb-2 flex-wrap shrink-0">
          {(['all', '7days', '30days', 'custom'] as DateFilterPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => handleDateFilterChange(preset)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full transition-colors',
                'border border-border/50',
                dateFilter === preset
                  ? 'bg-cyber-sigil/20 text-cyber-sigil border-cyber-sigil/50'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {preset === 'all' && labels.all}
              {preset === '7days' && labels.days7}
              {preset === '30days' && labels.days30}
              {preset === 'custom' && labels.custom}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {showCustomDates && (
          <div className="flex gap-2 mb-2 shrink-0">
            <div className="flex-1">
              <Input
                type="date"
                value={customDateStart}
                onChange={(e) => setCustomDateStart(e.target.value)}
                className="h-8 text-xs bg-muted/30"
              />
            </div>
            <div className="flex-1">
              <Input
                type="date"
                value={customDateEnd}
                onChange={(e) => setCustomDateEnd(e.target.value)}
                className="h-8 text-xs bg-muted/30"
              />
            </div>
          </div>
        )}

        {/* Multi-select toolbar */}
        {multiSelectMode && (
          <div className="flex items-center justify-between gap-2 mb-2 p-2 rounded-lg bg-cyber-sigil/10 border border-cyber-sigil/30 shrink-0">
            <span className="text-sm">
              {labels.selected}: <strong>{selectedIds.size}</strong>/{MAX_MULTI_SELECT}
            </span>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-7 px-2 text-xs"
                >
                  {labels.clear}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleMultiSelectConfirm}
                disabled={selectedIds.size === 0 || isProcessing}
                className="h-7 px-3 text-xs btn-cyber"
              >
                {isProcessing && processingProgress ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {labels.processing} {processingProgress.current}/{processingProgress.total}
                  </span>
                ) : (
                  `${labels.attach} (${selectedIds.size})`
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Virtualized grid */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
          style={{ contain: 'strict' }}
        >
          {!attachments || attachments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 p-6 rounded-xl bg-muted/30">
                <ImageIcon className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{labels.noPhotos}</p>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 p-6 rounded-xl bg-muted/30">
                <FilterX className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{labels.noResults}</p>
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3 gap-1">
                <X className="h-3 w-3" />
                {labels.resetFilters}
              </Button>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="grid grid-cols-3 gap-1.5 px-0.5"
                  >
                    {row.map((img) => {
                      const previewUrl = getPreviewUrl(img.id!);
                      const isSelected = selectedIds.has(img.id!);
                      
                      return (
                        <button
                          key={img.id}
                          onClick={() => {
                            if (multiSelectMode) {
                              toggleSelection(img.id!);
                            } else {
                              handleSingleSelect(img);
                            }
                          }}
                          disabled={isProcessing && !multiSelectMode}
                          className={cn(
                            'relative aspect-square rounded-lg overflow-hidden',
                            'border bg-muted/20',
                            'transition-all duration-150',
                            'focus:outline-none focus:ring-2 focus:ring-cyber-sigil/50',
                            'disabled:opacity-50',
                            isSelected 
                              ? 'border-cyber-sigil ring-2 ring-cyber-sigil scale-95' 
                              : 'border-border/50 hover:border-cyber-sigil/50 hover:scale-[1.02]'
                          )}
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted/30">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Selection checkmark */}
                          {multiSelectMode && isSelected && (
                            <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-cyber-sigil flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                          
                          {/* Date badge */}
                          {img.entryDate && (
                            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-gradient-to-t from-black/70 to-transparent">
                              <span className="flex items-center gap-0.5 text-[9px] text-white/90">
                                <Calendar className="h-2 w-2" />
                                {formatDate(img.entryDate)}
                              </span>
                            </div>
                          )}
                          
                          {/* Tag chip */}
                          {img.entryTags && img.entryTags.length > 0 && !isSelected && (
                            <div className="absolute top-1 right-1">
                              <span className="px-1 py-0.5 text-[8px] bg-cyber-sigil/80 text-white rounded-full">
                                {img.entryTags[0]}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
