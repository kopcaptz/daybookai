import { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/mediaUtils';
import { MEDIA_LIMITS } from '@/lib/db';
import { toast } from 'sonner';

interface PhotoCaptureProps {
  onCapture: (blob: Blob, mimeType: string) => void;
  disabled?: boolean;
}

export function PhotoCapture({ onCapture, disabled }: PhotoCaptureProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }

    setIsProcessing(true);
    try {
      const compressed = await compressImage(file);
      
      if (compressed.size > MEDIA_LIMITS.image.maxSize) {
        toast.error(`Изображение слишком большое после сжатия`);
        return;
      }

      onCapture(compressed, compressed.type || 'image/jpeg');
      toast.success('Фото добавлено');
    } catch (error) {
      console.error('Photo processing failed:', error);
      toast.error('Не удалось обработать изображение');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="flex gap-2">
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
        variant="outline"
        size="sm"
        onClick={() => cameraInputRef.current?.click()}
        disabled={disabled || isProcessing}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        <span className="hidden sm:inline">Фото</span>
      </Button>

      {/* Gallery button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => galleryInputRef.current?.click()}
        disabled={disabled || isProcessing}
        className="gap-1.5"
      >
        <ImageIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Галерея</span>
      </Button>
    </div>
  );
}
