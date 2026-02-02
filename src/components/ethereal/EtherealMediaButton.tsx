import { useState, useRef } from 'react';
import { Plus, Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { compressChatImage } from '@/lib/chatImageUtils';
import { toast } from 'sonner';

interface EtherealMediaButtonProps {
  onImageSelect: (blob: Blob) => void;
  disabled?: boolean;
}

export function EtherealMediaButton({ onImageSelect, disabled }: EtherealMediaButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await compressChatImage(file);
      if (!result.success) {
        toast.error('error' in result ? result.message : 'Ошибка сжатия');
        return;
      }
      onImageSelect(result.blob);
    } catch (error) {
      toast.error('Ошибка обработки изображения');
    } finally {
      setIsProcessing(false);
      // Reset inputs
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || isProcessing}
            className="h-10 w-10 shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onClick={() => cameraRef.current?.click()}>
            <Camera className="mr-2 h-4 w-4" />
            Камера
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => galleryRef.current?.click()}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Галерея
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
