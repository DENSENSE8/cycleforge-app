import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskMediaLink, updateTaskMediaLink, type TaskMediaLinksDeps, type NewTaskMediaLinkRow, type TaskMediaLinkUpdate } from './task-media-links';
import type { TaskMediaLink } from './media-links';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TIME = '2026-09-25T00:00:00.000Z';

function fakes(initial: TaskMediaLink[] = []) {
  const rows = [...initial];
  const inserts: NewTaskMediaLinkRow[] = [];
  const updates: TaskMediaLinkUpdate[] = [];
  const deps: TaskMediaLinksDeps = {
    taskExists: async (id) => id === 42,
    insertLink: async (row) => {
      inserts.push(row);
      const existing = rows.find((r) => r.url === row.url);
      if (existing) return { id: existing.id, created: false };
      const id = rows.length + 1;
      rows.push({ ...row, id, createdAt: TIME, updatedAt: TIME, createdBy: null });
      return { id, created: true };
    },
    readLinks: async (_, opts) => rows.filter((r) => opts?.linkId == null || r.id === opts.linkId),
    updateLink: async (_, id, update) => {
      const existing = rows.find((r) => r.id === id);
      if (!existing) return 'not_found';
      if (update.link && rows.some((r) => r.id !== id && r.url === update.link?.url)) return 'duplicate';
      updates.push(update);
      Object.assign(existing, update.link, update.title !== undefined ? { title: update.title } : {});
      return 'updated';
    },
    deleteLink: async () => null,
  };
  return { deps, rows, inserts, updates };
}

test('a link attaches parsed media under the target task and repeat spellings reuse it', async () => {
  const { deps, rows, inserts } = fakes();
  const first = await createTaskMediaLink(42, 7, { url: 'youtu.be/dQw4w9WgXcQ', title: 'Walkthrough' }, deps);
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.created, true);
  assert.equal(rows.length, 1);
  assert.deepEqual(inserts[0], {
    taskId: 42,
    kind: 'video',
    provider: 'youtube',
    url: YOUTUBE,
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    title: 'Walkthrough',
    createdByStaffId: 7,
  });
  const repeat = await createTaskMediaLink(42, 7, { url: YOUTUBE }, deps);
  assert.equal(repeat.ok && repeat.created, false);
  assert.equal(rows.length, 1);
});

test('changing a video URL to an image changes the stored kind and embed, not just the caption', async () => {
  const { deps, rows, updates } = fakes();
  await createTaskMediaLink(42, 7, { url: YOUTUBE }, deps);
  const result = await updateTaskMediaLink(42, 1, { url: 'https://cdn.example.com/step.jpg', title: 'Step 1' }, deps);
  assert.equal(result.ok && result.changed, true);
  assert.deepEqual(updates[0], {
    link: {
      kind: 'photo', provider: 'image', url: 'https://cdn.example.com/step.jpg',
      embedUrl: 'https://cdn.example.com/step.jpg', thumbnailUrl: 'https://cdn.example.com/step.jpg',
    },
    title: 'Step 1',
  });
  assert.equal(rows[0].kind, 'photo');
  assert.equal(rows[0].provider, 'image');
  assert.equal(rows[0].title, 'Step 1');
});

test('invalid edits and duplicate URLs cannot overwrite an existing link', async () => {
  const { deps, rows, updates } = fakes();
  await createTaskMediaLink(42, 7, { url: YOUTUBE }, deps);
  await createTaskMediaLink(42, 7, { url: 'https://cdn.example.com/step.jpg' }, deps);
  assert.deepEqual(await updateTaskMediaLink(42, 1, { url: 'javascript:alert(1)' }, deps), { ok: false, reason: 'invalid_url' });
  assert.deepEqual(await updateTaskMediaLink(42, 1, { url: 'https://cdn.example.com/step.jpg' }, deps), { ok: false, reason: 'duplicate_link' });
  assert.equal(updates.length, 0);
  assert.equal(rows[0].url, YOUTUBE);
});
