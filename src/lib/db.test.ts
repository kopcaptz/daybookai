import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDiscussionSession, db, getAllDiscussionSessions, updateDiscussionSession } from './db';

describe('discussion birth contract', () => {
  beforeEach(async () => {
    await db.discussionMessages.clear();
    await db.discussionSessions.clear();
  });

  afterEach(async () => {
    await db.discussionMessages.clear();
    await db.discussionSessions.clear();
  });

  it('rejects zero-entry discussion birth', async () => {
    await expect(
      createDiscussionSession({
        title: 'Invalid discussion',
        scope: { entryIds: [], docIds: [9] },
        modeDefault: 'discuss',
      })
    ).rejects.toThrow('Discussion sessions require at least one entry ID.');
  });

  it('returns only entry-backed sessions in the continuity surface', async () => {
    const now = Date.now();
    await db.discussionSessions.add({
      title: 'Legacy invalid discussion',
      createdAt: now,
      updatedAt: now,
      lastMessageAt: 10,
      scope: { entryIds: [], docIds: [9] },
      modeDefault: 'discuss',
    });
    const entryBackedId = await createDiscussionSession({
      title: 'Real discussion',
      scope: { entryIds: [7], docIds: [9] },
      modeDefault: 'discuss',
    });

    await updateDiscussionSession(entryBackedId, { lastMessageAt: 20 });

    const sessions = await getAllDiscussionSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: entryBackedId,
      title: 'Real discussion',
      scope: { entryIds: [7], docIds: [9] },
    });
  });

  it('keeps multiple entry-backed sessions visible and sorted normally', async () => {
    const olderId = await createDiscussionSession({
      title: 'Older real discussion',
      scope: { entryIds: [1], docIds: [] },
      modeDefault: 'discuss',
    });
    const newerId = await createDiscussionSession({
      title: 'Newer real discussion',
      scope: { entryIds: [2], docIds: [] },
      modeDefault: 'discuss',
    });

    await updateDiscussionSession(olderId, { lastMessageAt: 10 });
    await updateDiscussionSession(newerId, { lastMessageAt: 20 });

    const sessions = await getAllDiscussionSessions();

    expect(sessions.map(session => session.id)).toEqual([newerId, olderId]);
  });
});
