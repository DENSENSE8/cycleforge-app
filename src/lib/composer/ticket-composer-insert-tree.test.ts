/**
 * The Ticket `+` tree — REQ-PLUS-05, and the interaction budget that keeps both
 * photo rows at the root.
 *
 *   node --import tsx --test src/lib/composer/ticket-composer-insert-tree.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTicketComposerInsertTree } from './ticket-composer-insert-tree';

test('REQ-PLUS-05: Photos are the whole menu — Browse library, then Upload file', () => {
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {} },
  });
  assert.deepEqual(
    nodes.map((n) => n.label),
    ['Browse library', 'Upload file'],
  );
  assert.deepEqual(
    nodes.map((n) => n.disabled),
    [false, false],
  );
});

test('both rows sit at the ROOT — attaching a photo costs 2 taps, not 3', () => {
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {} },
  });
  assert.equal(
    nodes.every((n) => n.type === 'action'),
    true,
    'no `Photos ›` page in between: one row that drills into two buys nothing',
  );
});

test('a leaf runs the handler it was given', () => {
  const fired: string[] = [];
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => fired.push('browse'), onUpload: () => fired.push('upload') },
  });
  for (const n of nodes) if (n.type === 'action') n.onSelect();
  assert.deepEqual(fired, ['browse', 'upload']);
});

test('a photo path with no handler renders DISABLED — never a dead click', () => {
  // No library permission: browsing is off, uploading still works.
  const nodes = buildTicketComposerInsertTree({ photos: { onUpload: () => {} } });
  assert.equal(nodes.find((n) => n.id === 'photos-browse')?.disabled, true);
  assert.equal(nodes.find((n) => n.id === 'photos-upload')?.disabled, false);
  // The disabled row is still safe to invoke — it must not throw on a missing
  // handler, because `disabled` is chrome and chrome can be bypassed.
  const browse = nodes.find((n) => n.id === 'photos-browse')!;
  if (browse.type === 'action') browse.onSelect();
});

test('the whole staging pipeline being down disables both rows, not one', () => {
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {}, disabled: true },
  });
  assert.deepEqual(
    nodes.map((n) => n.disabled),
    [true, true],
  );
});

test('no ticket means no rows at all — the menu says so rather than lying', () => {
  assert.deepEqual(buildTicketComposerInsertTree({}), []);
});

test('product / “what happened” inserts are GONE (operator ruling 2026-08-30)', () => {
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {} },
  });
  // They cost a /api/support/context + shipped-order fetch per ticket line just
  // to fill a menu, and attached chips the operator did not want above the
  // field. Re-wiring them is a deliberate decision, not a drive-by.
  assert.equal(nodes.some((n) => n.id === 'this-item'), false);
  assert.equal(nodes.some((n) => n.id === 'what-happened'), false);
});
