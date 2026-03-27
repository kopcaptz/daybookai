// Audio Transcription Service
// Handles transcription of audio attachments via Gemini AI

import { db, AudioTranscript } from './db';
import { logger } from './logger';
import { getAITokenHeader } from './aiUtils';

const AI_TRANSCRIBE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-transcribe`;

export type TranscriptionResult = 
  | { ok: true; text: string; language: string }
  | { ok: false; errorCode: string };

export async function getCachedTranscript(
  attachmentId: number
): Promise<AudioTranscript | undefined> {
  return db.audioTranscripts.get(attachmentId);
}

export async function requestTranscription(
  attachmentId: number,
  blob: Blob,
  opts?: { 
    languageHint?: string; 
  }
): Promise<TranscriptionResult> {
  // 1. Check cache first
  const cached = await db.audioTranscripts.get(attachmentId);
  
  if (cached) {
    if (cached.status === 'done' && cached.text) {
      return { ok: true, text: cached.text, language: cached.language || 'en' };
    }
    if (cached.status === 'pending') {
      return { ok: false, errorCode: 'pending' };
    }
  }

  // 2. Write pending state to DB
  const now = Date.now();
  await db.audioTranscripts.put({
    attachmentId,
    createdAt: cached?.createdAt || now,
    updatedAt: now,
    status: 'pending',
    model: 'google/gemini-2.5-flash',
    text: null,
    language: null,
    durationSec: null,
    errorCode: null,
  });

  try {
    // 3. Build FormData and send to edge function
    const formData = new FormData();
    formData.append('file', blob);
    if (opts?.languageHint) {
      formData.append('languageHint', opts.languageHint);
    }

    const headers = getAITokenHeader();

    const response = await fetch(AI_TRANSCRIBE_URL, {
      method: 'POST',
      headers,
      body: formData,
    });

    // 4. Handle response
    if (response.ok) {
      const data = await response.json();
      
      await db.audioTranscripts.put({
        attachmentId,
        createdAt: cached?.createdAt || now,
        updatedAt: Date.now(),
        status: 'done',
        model: data.model || 'google/gemini-2.5-flash',
        text: data.text || '',
        language: data.language || 'en',
        durationSec: null,
        errorCode: null,
      });

      return { ok: true, text: data.text || '', language: data.language || 'en' };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorCode = errorData.error || 'transcription_failed';

    await db.audioTranscripts.put({
      attachmentId,
      createdAt: cached?.createdAt || now,
      updatedAt: Date.now(),
      status: 'error',
      model: 'google/gemini-2.5-flash',
      text: null,
      language: null,
      durationSec: null,
      errorCode,
    });

    if (response.status === 401) {
      return { ok: false, errorCode: 'auth_required' };
    }
    if (response.status === 429) {
      return { ok: false, errorCode: 'rate_limited' };
    }
    if (response.status === 402) {
      return { ok: false, errorCode: 'payment_required' };
    }

    return { ok: false, errorCode };
  } catch (error) {
    logger.error('Transcription', 'Request failed', error as Error);

    await db.audioTranscripts.put({
      attachmentId,
      createdAt: cached?.createdAt || now,
      updatedAt: Date.now(),
      status: 'error',
      model: 'google/gemini-2.5-flash',
      text: null,
      language: null,
      durationSec: null,
      errorCode: 'network_error',
    });

    return { ok: false, errorCode: 'network_error' };
  }
}

export async function clearTranscript(attachmentId: number): Promise<void> {
  await db.audioTranscripts.delete(attachmentId);
}
