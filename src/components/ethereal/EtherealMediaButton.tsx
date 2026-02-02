import { useState, useRef, forwardRef } from 'react';
import { Plus, Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { compressChatImage } from '@/lib/chatImageUtils';
import { toast } from 'sonner';

interface EtherealMediaButtonProps {
  onImageSelect: (blob: Blob) => void;
  disabled?: boolean;
}

export const EtherealMediaButton = forwardRef<HTMLButtonElement, EtherealMediaButtonProps>(
  function EtherealMediaButton({ onImageSelect, disabled }, ref) {
    const [isOpen, setIsOpen] = useState(false);
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

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              ref={ref}
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
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto pb-8">
            <div className="flex gap-4 justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] h-14"
                onClick={() => {
                  cameraRef.current?.click();
                  setIsOpen(false);
                }}
              >
                <Camera className="mr-2 h-5 w-5" />
                Камера
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] h-14"
                onClick={() => {
                  galleryRef.current?.click();
                  setIsOpen(false);
                }}
              >
                <ImageIcon className="mr-2 h-5 w-5" />
                Галерея
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }
);
