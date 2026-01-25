import { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, BookImage, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressChatImage } from '@/lib/chatImageUtils';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface ChatImageCaptureProps {
  onImageReady: (result: { blob: Blob; base64DataUrl: string }) => void;
  onDiaryPickerOpen: () => void;
  disabled?: boolean;
}

export function ChatImageCapture({ onImageReady, onDiaryPickerOpen, disabled }: ChatImageCaptureProps) {
  const { t, language } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'ru' ? 'Выберите изображение' : 'Select an image');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await compressChatImage(file);
      
      if (result.success === false) {
        const errorMessages: Record<string, string> = {
          image_too_large: language === 'ru' ? 'Изображение слишком большое' : 'Image too large',
          invalid_image: language === 'ru' ? 'Не удалось загрузить изображение' : 'Failed to load image',
          compression_failed: language === 'ru' ? 'Ошибка сжатия' : 'Compression failed',
        };
        toast.error(errorMessages[result.error] || result.message);
        return;
      }

      onImageReady({ blob: result.blob, base64DataUrl: result.base64DataUrl });
    } catch (error) {
      console.error('Image processing failed:', error);
      toast.error(language === 'ru' ? 'Не удалось обработать изображение' : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    e.target.value = '';
  };

  return (
    <div className="flex gap-1">
      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isProcessing}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      {/* Camera button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled || isProcessing}
        className="h-10 w-10 hover:bg-cyber-glow/10"
        title={t('media.photo')}
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </Button>

      {/* Gallery button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => galleryInputRef.current?.click()}
        disabled={disabled || isProcessing}
        className="h-10 w-10 hover:bg-cyber-glow/10"
        title={language === 'ru' ? 'Галерея' : 'Gallery'}
      >
        <ImageIcon className="h-4 w-4" />
      </Button>

      {/* From Diary button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDiaryPickerOpen}
        disabled={disabled || isProcessing}
        className="h-10 w-10 hover:bg-cyber-glow/10"
        title={language === 'ru' ? 'Из дневника' : 'From diary'}
      >
        <BookImage className="h-4 w-4" />
      </Button>
    </div>
  );
}
