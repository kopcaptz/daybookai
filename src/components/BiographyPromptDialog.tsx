import { format, parseISO } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { BiographyPrompt } from '@/hooks/useBiographyPrompts';

interface BiographyPromptDialogProps {
  prompt: BiographyPrompt | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onDismiss: () => void;
}

export function BiographyPromptDialog({
  prompt,
  isGenerating,
  onGenerate,
  onDismiss,
}: BiographyPromptDialogProps) {
  const { t, language } = useI18n();
  const locale = language === 'ru' ? ru : enUS;
  
  if (!prompt) return null;
  
  const formattedDate = format(parseISO(prompt.date), 'd MMMM', { locale });
  const isUpdate = prompt.type === 'update';
  
  const title = isUpdate
    ? (language === 'ru' ? 'Обновить хронику?' : 'Update chronicle?')
    : (language === 'ru' ? 'Создать хронику дня?' : 'Create day chronicle?');
  
  const description = isUpdate
    ? (language === 'ru' 
        ? `Добавлена запись за ${formattedDate}. Обновить хронику?`
        : `Entry added for ${formattedDate}. Update chronicle?`)
    : (language === 'ru'
        ? `Создать хронику дня ${formattedDate}?`
        : `Create chronicle for ${formattedDate}?`);
  
  const generateLabel = isUpdate
    ? (language === 'ru' ? 'Обновить' : 'Update')
    : (language === 'ru' ? 'Создать' : 'Create');
  
  const laterLabel = language === 'ru' ? 'Позже' : 'Later';
  
  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {language === 'ru' ? 'Создание...' : 'Creating...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {generateLabel}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={isGenerating}
            className="w-full"
          >
            {laterLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
