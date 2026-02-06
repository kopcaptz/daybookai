// Audio Transcription Service
// Handles transcription of audio attachments via Gemini AI

import { db, AudioTranscript } from './db';
import { getAIToken, isAITokenValid } from './aiTokenService';
import { logger } from './logger';

const AI_TRANSCRIBE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-transcribe`;

export type TranscriptionResult = 
  | { ok: true; text: string; language: string }
  | { ok: false; errorCode: string };

/**
 * Get cached transcript for an attachment
 */
export async function getCachedTranscript(
  attachmentId: number
): Promise<AudioTranscript | undefined> {
  return db.audioTranscripts.get(attachmentId);
}

/**
 * Request transcription for an audio attachment
 * Handles caching, token validation, and edge function call
 */
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
    // Return cached done result
    if (cached.status === 'done' && cached.text) {
      return { ok: true, text: cached.text, language: cached.language || 'en' };
    }
    // Return pending state
    if (cached.status === 'pending') {
      return { ok: false, errorCode: 'pending' };
    }
    // Error state - allow retry by continuing
  }

  // 2. Validate AI token
  if (!isAITokenValid()) {
    return { ok: false, errorCode: 'auth_required' };
  }

  const tokenData = getAIToken();
  if (!tokenData) {
    return { ok: false, errorCode: 'auth_required' };
  }

  // 3. Write pending state to DB
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
    // 4. Build FormData and send to edge function
    const formData = new FormData();
    formData.append('file', blob);
    if (opts?.languageHint) {
      formData.append('languageHint', opts.languageHint);
    }

    const response = await fetch(AI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        'X-AI-Token': tokenData.token,
      },
      body: formData,
    });

    // 5. Handle response
    if (response.ok) {
      const data = await response.json();
      
      // Update DB with success
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

    // Handle error responses
    const errorData = await response.json().catch(() => ({}));
    const errorCode = errorData.error || 'transcription_failed';

    // Update DB with error
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

    // Map HTTP status to error codes
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
    // Network or other error
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

/**
 * Clear transcript for an attachment (for retry)
 */
export async function clearTranscript(attachmentId: number): Promise<void> {
  await db.audioTranscripts.delete(attachmentId);
}
