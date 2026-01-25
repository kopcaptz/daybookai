import { useEffect, useRef, useCallback } from 'react';
import { Draft, saveDraft, getDraft, deleteDraft } from '@/lib/db';
import { AttachmentPreview } from '@/components/media/AttachmentList';

const AUTOSAVE_INTERVAL = 3000; // 3 seconds

interface DraftData {
  text: string;
  mood: number;
  tags: string[];
  isPrivate: boolean;
  attachments: AttachmentPreview[];
}

interface UseDraftOptions {
  draftId: string;
  data: DraftData;
  enabled?: boolean;
}

export function useDraft({ draftId, data, enabled = true }: UseDraftOptions) {
  const lastSavedRef = useRef<string>('');
  const timerRef = useRef<number | null>(null);

  const save = useCallback(async () => {
    const serialized = JSON.stringify({
      text: data.text,
      mood: data.mood,
      tags: data.tags,
      isPrivate: data.isPrivate,
      attachmentsCount: data.attachments.length,
    });

    // Skip if nothing changed
    if (serialized === lastSavedRef.current) return;

    try {
      const draft: Draft = {
        id: draftId,
        text: data.text,
        mood: data.mood,
        tags: data.tags,
        isPrivate: data.isPrivate,
        attachments: data.attachments.map(a => ({
          tempId: a.tempId,
          kind: a.kind,
          mimeType: a.mimeType,
          size: a.size,
          duration: a.duration,
          blob: a.blob,
          thumbnail: a.thumbnail,
        })),
        updatedAt: Date.now(),
      };

      await saveDraft(draft);
      lastSavedRef.current = serialized;
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [draftId, data]);

  // Auto-save interval
  useEffect(() => {
    if (!enabled) return;

    timerRef.current = window.setInterval(save, AUTOSAVE_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [save, enabled]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (enabled) {
        save();
      }
    };
  }, [save, enabled]);

  return { save };
}

export async function loadDraft(draftId: string): Promise<DraftData | null> {
  try {
    const draft = await getDraft(draftId);
    if (!draft) return null;

    return {
      text: draft.text,
      mood: draft.mood,
      tags: draft.tags,
      isPrivate: draft.isPrivate,
      attachments: draft.attachments.map(a => ({
        tempId: a.tempId,
        kind: a.kind,
        mimeType: a.mimeType,
        size: a.size,
        duration: a.duration,
        blob: a.blob,
        thumbnail: a.thumbnail,
      })),
    };
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

export async function removeDraft(draftId: string): Promise<void> {
  try {
    await deleteDraft(draftId);
  } catch (error) {
    console.error('Failed to delete draft:', error);
  }
}

export function hasDraftContent(data: DraftData): boolean {
  return (
    data.text.trim().length > 0 ||
    data.attachments.length > 0 ||
    data.tags.length > 0 ||
    data.mood !== 3
  );
}
