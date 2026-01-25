import { PhotoCapture } from './PhotoCapture';
import { AudioCapture } from './AudioCapture';
import { Dictation } from './Dictation';

interface MediaToolbarProps {
  onPhotoCapture: (blob: Blob, mimeType: string) => void;
  onAudioCapture: (blob: Blob, mimeType: string, duration: number) => void;
  onDictation: (text: string) => void;
  disabled?: boolean;
}

export function MediaToolbar({
  onPhotoCapture,
  onAudioCapture,
  onDictation,
  disabled,
}: MediaToolbarProps) {
  return (
    <div className="toolbar-cyber">
      <PhotoCapture onCapture={onPhotoCapture} disabled={disabled} />
      <div className="h-6 w-px bg-cyber-glow/20" />
      <AudioCapture onCapture={onAudioCapture} disabled={disabled} />
      <div className="h-6 w-px bg-cyber-glow/20" />
      <Dictation onTranscript={onDictation} disabled={disabled} />
    </div>
  );
}
