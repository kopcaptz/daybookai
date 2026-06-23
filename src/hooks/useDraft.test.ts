import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { hasDraftContent, loadDraft, useDraft } from './useDraft';

const mocks = vi.hoisted(() => ({
  saveDraft: vi.fn(),
  getDraft: vi.fn(),
  deleteDraft: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  saveDraft: mocks.saveDraft,
  getDraft: mocks.getDraft,
  deleteDraft: mocks.deleteDraft,
}));

describe('useDraft mood provenance carry-through', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.saveDraft.mockReset();
    mocks.getDraft.mockReset();
    mocks.deleteDraft.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('saves userChangedMood so draft restore does not infer authorship from mood value', async () => {
    renderHook(() => useDraft({
      draftId: 'new',
      data: {
        text: 'I selected neutral mood explicitly',
        mood: 3,
        userChangedMood: true,
        tags: [],
        isPrivate: false,
        attachments: [],
      },
      enabled: true,
    }));

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: 'new',
      mood: 3,
      userChangedMood: true,
    }));
  });

  it('loads userChangedMood from stored drafts', async () => {
    mocks.getDraft.mockResolvedValue({
      id: 'new',
      text: 'restored',
      mood: 4,
      userChangedMood: true,
      tags: [],
      isPrivate: false,
      attachments: [],
      updatedAt: 1,
    });

    await expect(loadDraft('new')).resolves.toMatchObject({
      mood: 4,
      userChangedMood: true,
    });
  });

  it('treats an explicit neutral mood selection as draft content', () => {
    expect(hasDraftContent({
      text: '',
      mood: 3,
      userChangedMood: true,
      tags: [],
      isPrivate: false,
      attachments: [],
    })).toBe(true);
  });

  it('does not treat non-default mood as content without userChangedMood', () => {
    expect(hasDraftContent({
      text: '',
      mood: 4,
      userChangedMood: false,
      tags: [],
      isPrivate: false,
      attachments: [],
    })).toBe(false);
  });
});
