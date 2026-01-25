/**
 * Chat Image Utilities
 * Compression and validation for images sent in AI chat
 * Privacy-safe: no logging of image content
 */

export const CHAT_IMAGE_LIMITS = {
  maxDimension: 1600,
  targetSize: 400 * 1024, // 400KB target
  hardLimit: 1.5 * 1024 * 1024, // 1.5MB absolute max
  quality: {
    initial: 0.85,
    min: 0.4,
    step: 0.1,
  },
};

export type ChatImageResult = 
  | {
      success: true;
      blob: Blob;
      base64DataUrl: string;
      originalSize: number;
      compressedSize: number;
    }
  | {
      success: false;
      error: 'image_too_large' | 'invalid_image' | 'compression_failed';
      message: string;
    };

/**
 * Compress and convert image for chat multimodal message
 * Returns data:image/jpeg;base64,... format ready for API
 */
export async function compressChatImage(file: File | Blob): Promise<ChatImageResult> {
  const originalSize = file.size;
  
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = async () => {
      URL.revokeObjectURL(url);
      
      try {
        const { width, height } = calculateDimensions(img.width, img.height, CHAT_IMAGE_LIMITS.maxDimension);
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve({
            success: false,
            error: 'compression_failed',
            message: 'Canvas context unavailable',
          });
          return;
        }
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress with quality steps
        let quality = CHAT_IMAGE_LIMITS.quality.initial;
        let blob: Blob | null = null;
        
        while (quality >= CHAT_IMAGE_LIMITS.quality.min) {
          blob = await canvasToBlob(canvas, 'image/jpeg', quality);
          
          if (blob.size <= CHAT_IMAGE_LIMITS.targetSize) {
            break;
          }
          
          quality -= CHAT_IMAGE_LIMITS.quality.step;
        }
        
        if (!blob) {
          resolve({
            success: false,
            error: 'compression_failed',
            message: 'Failed to compress image',
          });
          return;
        }
        
        // Check hard limit
        if (blob.size > CHAT_IMAGE_LIMITS.hardLimit) {
          resolve({
            success: false,
            error: 'image_too_large',
            message: `Image too large (${formatSize(blob.size)} > ${formatSize(CHAT_IMAGE_LIMITS.hardLimit)})`,
          });
          return;
        }
        
        // Convert to base64 data URL
        const base64DataUrl = await blobToDataUrl(blob);
        
        resolve({
          success: true,
          blob,
          base64DataUrl,
          originalSize,
          compressedSize: blob.size,
        });
      } catch (error) {
        resolve({
          success: false,
          error: 'compression_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        success: false,
        error: 'invalid_image',
        message: 'Failed to load image',
      });
    };
    
    img.src = url;
  });
}

function calculateDimensions(originalWidth: number, originalHeight: number, maxDimension: number): { width: number; height: number } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }
  
  const ratio = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed'));
        }
      },
      type,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
