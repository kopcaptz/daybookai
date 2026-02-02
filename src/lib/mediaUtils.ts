import { MEDIA_LIMITS } from './db';

/**
 * Compress an image to meet size and dimension limits
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  const { maxDimension, quality, maxSize } = MEDIA_LIMITS.image;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      
      // Calculate new dimensions maintaining aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Try WebP first, fall back to JPEG
      const tryCompress = (format: string, q: number): Promise<Blob> => {
        return new Promise((res, rej) => {
          canvas.toBlob(
            (blob) => {
              if (blob) res(blob);
              else rej(new Error('Failed to create blob'));
            },
            format,
            q
          );
        });
      };
      
      // Attempt compression with decreasing quality
      const attemptCompression = async () => {
        let currentQuality = quality;
        let blob: Blob | null = null;
        
        // Try WebP first
        try {
          blob = await tryCompress('image/webp', currentQuality);
          if (blob.size <= maxSize) {
            resolve(blob);
            return;
          }
        } catch {
          // WebP not supported, continue
        }
        
        // Fall back to JPEG with decreasing quality
        while (currentQuality >= 0.5) {
          try {
            blob = await tryCompress('image/jpeg', currentQuality);
            if (blob.size <= maxSize) {
              resolve(blob);
              return;
            }
            currentQuality -= 0.1;
          } catch (e) {
            reject(e);
            return;
          }
        }
        
        // Return the smallest we could get
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to compress image'));
        }
      };
      
      attemptCompression();
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Generate a thumbnail for video
 */
export async function generateVideoThumbnail(videoBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail'));
        },
        'image/jpeg',
        0.7
      );
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
    
    video.src = url;
    video.load();
  });
}

/**
 * Get video duration
 */
export async function getVideoDuration(videoBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
    
    video.src = url;
    video.load();
  });
}

/**
 * Get audio duration with workaround for browsers returning Infinity for webm
 */
export async function getAudioDuration(audioBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(audioBlob);
    let resolved = false;
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        URL.revokeObjectURL(url);
      }
    };
    
    audio.preload = 'metadata';
    
    audio.onloadedmetadata = () => {
      // If duration is valid, resolve immediately
      if (isFinite(audio.duration) && audio.duration > 0) {
        cleanup();
        resolve(audio.duration);
        return;
      }
      
      // Workaround: seek to end to force duration calculation for webm
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    };
    
    // After seek, duration should become finite
    audio.ontimeupdate = () => {
      if (resolved) return;
      audio.ontimeupdate = null;
      cleanup();
      
      if (isFinite(audio.duration) && audio.duration > 0) {
        resolve(audio.duration);
      } else {
        // Fallback: return -1 so caller uses recordingTime
        resolve(-1);
      }
    };
    
    audio.onerror = () => {
      cleanup();
      reject(new Error('Failed to load audio'));
    };
    
    audio.src = url;
    audio.load();
  });
}

/**
 * Validate video against limits
 */
export async function validateVideo(blob: Blob): Promise<{
  valid: boolean;
  errors: string[];
  duration?: number;
}> {
  const errors: string[] = [];
  const { maxSize, maxDuration } = MEDIA_LIMITS.video;
  
  if (blob.size > maxSize) {
    errors.push(`Видео слишком большое (${formatFileSize(blob.size)}). Максимум: ${formatFileSize(maxSize)}`);
  }
  
  try {
    const duration = await getVideoDuration(blob);
    
    if (duration > maxDuration) {
      errors.push(`Видео слишком длинное (${Math.round(duration)}с). Максимум: ${maxDuration}с`);
    }
    
    return { valid: errors.length === 0, errors, duration };
  } catch {
    errors.push('Не удалось прочитать видео');
    return { valid: false, errors };
  }
}

/**
 * Validate audio against limits
 * @param fallbackDuration - Use this duration if browser returns Infinity (e.g., recordingTime from AudioCapture)
 */
export async function validateAudio(
  blob: Blob,
  fallbackDuration?: number
): Promise<{
  valid: boolean;
  errors: string[];
  duration?: number;
}> {
  const errors: string[] = [];
  const { maxSize, maxDuration } = MEDIA_LIMITS.audio;
  
  if (blob.size > maxSize) {
    errors.push(`Аудио слишком большое (${formatFileSize(blob.size)}). Максимум: ${formatFileSize(maxSize)}`);
  }
  
  try {
    let duration = await getAudioDuration(blob);
    
    // If browser returned Infinity/-1, use fallback (actual recording time)
    if (!isFinite(duration) || duration <= 0) {
      duration = fallbackDuration ?? 0;
    }
    
    if (duration > maxDuration) {
      errors.push(`Аудио слишком длинное (${formatDuration(duration)}). Максимум: ${formatDuration(maxDuration)}`);
    }
    
    return { valid: errors.length === 0, errors, duration };
  } catch {
    errors.push('Не удалось прочитать аудио');
    return { valid: false, errors };
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  // Guard against Infinity/NaN
  if (!isFinite(seconds) || seconds < 0) {
    return '—';
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins === 0) return `${secs}с`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if Web Speech API is supported
 */
export function isSpeechRecognitionSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

/**
 * Check if MediaRecorder is supported
 */
export function isMediaRecorderSupported(): boolean {
  return 'MediaRecorder' in window;
}

/**
 * Get supported video MIME type
 */
export function getSupportedVideoMimeType(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  return 'video/webm';
}

/**
 * Get supported audio MIME type
 */
export function getSupportedAudioMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  
  return 'audio/webm';
}
