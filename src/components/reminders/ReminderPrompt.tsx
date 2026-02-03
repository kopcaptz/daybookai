/**
 * ReminderPrompt - Bottom sheet shown after saving an actionable diary entry.
 * Allows quick reminder creation linked to the saved entry.
 * Supports ru, en, he, ar languages with RTL layout.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { TIME_CHIPS, getTimestampForPreset, getLabel } from '@/lib/reminderUtils';
import { extractActionSnippet, type SuggestedTime } from '@/lib/reminderDetection';
import { createReminder } from '@/lib/db';
import { reconcileReminderNotifications } from '@/lib/reminderNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================
// LOCALIZED TEXTS
// ============================================

const texts = {
  title: { ru: 'Добавить напоминание?', en: 'Add a reminder?', he: 'להוסיף תזכורת?', ar: 'إضافة تذكير؟' },
  description: { 
    ru: 'Похоже, это важное дело. Напомнить позже?', 
    en: 'This looks like an action item. Set a reminder?', 
    he: 'נראה כמו משימה חשובה. להזכיר לך?', 
    ar: 'يبدو أن هذا أمر مهم. تعيين تذكير؟' 
  },
  whenToRemind: { ru: 'Когда напомнить?', en: 'When to remind?', he: 'מתי להזכיר?', ar: 'متى تريد التذكير؟' },
  notNow: { ru: 'Не сейчас', en: 'Not now', he: 'לא עכשיו', ar: 'ليس الآن' },
  create: { ru: 'Создать', en: 'Create', he: 'צור', ar: 'إنشاء' },
  creating: { ru: 'Создание...', en: 'Creating...', he: 'יוצר...', ar: 'جاري الإنشاء...' },
  entryNotFound: { ru: 'Ошибка: запись не найдена', en: 'Error: entry not found', he: 'שגיאה: הרשומה לא נמצאה', ar: 'خطأ: المدخل غير موجود' },
  invalidTime: { ru: 'Ошибка времени', en: 'Invalid time', he: 'זמן שגוי', ar: 'وقت غير صالح' },
  created: { ru: 'Напоминание создано', en: 'Reminder created', he: 'התזכורת נוצרה', ar: 'تم إنشاء التذكير' },
  failed: { ru: 'Ошибка создания', en: 'Creation failed', he: 'היצירה נכשלה', ar: 'فشل الإنشاء' },
};

type TextKey = keyof typeof texts;

interface ReminderPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number;
  sourceText: string;
  suggestedTime: SuggestedTime;
}

export function ReminderPrompt({
  open,
  onOpenChange,
  entryId,
  sourceText,
  suggestedTime,
}: ReminderPromptProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  
  // Helper to get localized text
  const t = (key: TextKey): string => 
    texts[key][language as keyof typeof texts[TextKey]] || texts[key].en;
  
  const [selectedPreset, setSelectedPreset] = useState<SuggestedTime>(suggestedTime);
  const [isCreating, setIsCreating] = useState(false);
  
  // Extract a short snippet for display
  const snippet = extractActionSnippet(sourceText, 80);
  
  const handleCreate = async () => {
    if (!entryId) {
      toast.error(t('entryNotFound'));
      return;
    }
    
    const dueAt = getTimestampForPreset(selectedPreset);
    if (!dueAt || dueAt <= Date.now()) {
      toast.error(t('invalidTime'));
      return;
    }
    
    setIsCreating(true);
    
    try {
      const actionText = extractActionSnippet(sourceText, 100);
      
      await createReminder({
        entryId,
        sourceText: sourceText.slice(0, 500), // Store more context
        actionText,
        dueAt,
        status: 'pending',
        repeat: 'none',
      });
      
      // Reconcile notifications
      await reconcileReminderNotifications(language);
      
      toast.success(t('created'));
      
      onOpenChange(false);
      navigate('/today');
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error(t('failed'));
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleDismiss = () => {
    onOpenChange(false);
  };
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 rtl:flex-row-reverse">
            <Bell className="h-5 w-5 text-cyber-sigil" />
            {t('title')}
          </SheetTitle>
          <SheetDescription>
            {t('description')}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-4 space-y-4">
          {/* Source text snippet */}
          <div className="panel-glass p-3 rounded-lg">
            <p className="text-sm text-foreground/90 line-clamp-2">
              "{snippet}"
            </p>
          </div>
          
          {/* Time preset chips */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t('whenToRemind')}
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedPreset(chip.id)}
                  disabled={isCreating}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors",
                    selectedPreset === chip.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {getLabel(chip, language)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleDismiss}
              disabled={isCreating}
              className="flex-1"
            >
              {t('notNow')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !entryId}
              className="flex-1 btn-cyber"
            >
              {isCreating ? t('creating') : t('create')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
