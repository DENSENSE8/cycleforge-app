/**
 * The Ticket `+` tree — REQ-PLUS-05, the interaction budget that keeps both
 * photo rows at the root, and the one product door (owner ruling 2026-10-03).
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

test('“what happened” and the per-line product inserts stay GONE (operator ruling 2026-08-30)', () => {
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {} },
    product: { onPick: () => {} },
  });
  // They cost a /api/support/context + shipped-order fetch per ticket line just
  // to fill a menu, and attached chips the operator did not want above the
  // field. Re-wiring them is a deliberate decision, not a drive-by.
  assert.equal(nodes.some((n) => n.id === 'this-item'), false);
  assert.equal(nodes.some((n) => n.id === 'what-happened'), false);
});

test('ONE product door: “Product sent to customer”, last, behind the `+` (owner ruling 2026-10-03)', () => {
  // Owner 2026-10-03: "behind an add, bottom left Plus icon" — the 2026-08-30
  // removal is reversed for this one item only. It opens a picker (no menu
  // fetch) and logs what we shipped (support_ticket_items).
  const fired: string[] = [];
  const nodes = buildTicketComposerInsertTree({
    photos: { onBrowse: () => {}, onUpload: () => {} },
    product: { onPick: () => fired.push('product') },
  });
  assert.deepEqual(
    nodes.map((n) => n.label),
    ['Browse library', 'Upload file', 'Product sent to customer'],
  );
  const product = nodes.find((n) => n.id === 'product-sent')!;
  assert.equal(product.type, 'action');
  assert.equal(product.disabled, false);
  if (product.type === 'action') product.onSelect();
  assert.deepEqual(fired, ['product']);
});

test('a product door with no handler renders DISABLED, never a dead click', () => {
  const nodes = buildTicketComposerInsertTree({ product: {} });
  assert.equal(nodes.find((n) => n.id === 'product-sent')?.disabled, true);
});
