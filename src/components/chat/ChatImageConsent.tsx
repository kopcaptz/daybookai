import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/lib/i18n';

interface ChatImageConsentProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  imagePreviewUrl?: string;
  imagePreviewUrls?: string[]; // For multi-image consent
}

export function ChatImageConsent({ 
  open, 
  onConfirm, 
  onCancel, 
  imagePreviewUrl,
  imagePreviewUrls 
}: ChatImageConsentProps) {
  const { language } = useI18n();

  // Support both single and multiple images
  const urls = imagePreviewUrls ?? (imagePreviewUrl ? [imagePreviewUrl] : []);
  const count = urls.length;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language === 'ru' 
              ? (count > 1 ? `Отправить ${count} фото?` : 'Отправить фото?')
              : (count > 1 ? `Send ${count} photos?` : 'Send photo?')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            {urls.length > 0 && (
              <div className={`rounded-lg overflow-hidden border border-border/50 bg-muted/30 p-1 ${
                urls.length === 1 
                  ? 'max-h-40 flex items-center justify-center' 
                  : 'grid grid-cols-2 gap-1'
              }`}>
                {urls.map((url, idx) => (
                  <img 
                    key={idx}
                    src={url} 
                    alt={`Preview ${idx + 1}`}
                    className={`object-cover rounded ${
                      urls.length === 1 
                        ? 'max-h-36 w-auto' 
                        : 'w-full aspect-square'
                    }`}
                  />
                ))}
              </div>
            )}
            <p className="text-sm">
              {language === 'ru' 
                ? (count > 1 
                    ? 'Фото будут отправлены Сигилу для анализа. Вложения дневника остаются локально.' 
                    : 'Фото будет отправлено Сигилу для анализа. Вложения дневника остаются локально.')
                : (count > 1
                    ? 'Photos will be sent to Sigil for analysis. Diary attachments remain local.'
                    : 'Photo will be sent to Sigil for analysis. Diary attachments remain local.')}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {language === 'ru' ? 'Отмена' : 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="btn-cyber">
            {language === 'ru' ? 'Отправить' : 'Send'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
