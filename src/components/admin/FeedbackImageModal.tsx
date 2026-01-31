import { X, Download } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeedbackImageModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function FeedbackImageModal({ imageUrl, onClose }: FeedbackImageModalProps) {
  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'feedback-image.jpg';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={!!imageUrl} onOpenChange={() => onClose()}>
      <DialogContent className={cn(
        "max-w-4xl w-full p-0 overflow-hidden",
        "bg-card/95 backdrop-blur-xl",
        "border border-border/50"
      )}>
        <div className="relative">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-3 bg-gradient-to-b from-black/60 to-transparent">
            <span className="text-sm text-white/80">Прикреплённое изображение</span>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleDownload}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Image */}
          {imageUrl && (
            <img 
              src={imageUrl} 
              alt="Feedback attachment"
              className="w-full h-auto max-h-[80vh] object-contain bg-black/20"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
