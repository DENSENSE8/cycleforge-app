import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The spine scrollport is a real `overflow-y-auto` box, and a transformed child
 * of an overflow box is CLIPPED at its edge. So a drag that moves the row in
 * flow (`CSS.Translate` on the row) makes the row disappear on its way up to
 * the Pinned cluster — which is exactly what happened the day the scroll chain
 * was fixed. The gesture must ride a portalled <DragOverlay> instead.
 *
 * Source-level guard on purpose: the defect is a CSS containment interaction
 * that jsdom does not model, so a render test would pass on the broken code.
 */
const list = readFileSync(
  new URL('./SidebarNavList.tsx', import.meta.url),
  'utf8',
);
const cluster = readFileSync(
  new URL('./MasterNavPinnedCluster.tsx', import.meta.url),
  'utf8',
);

test('the drag preview is portalled, not translated inside the scrollport', () => {
  assert.match(list, /<DragOverlay/, 'SidebarNavList must render a DragOverlay');
  assert.doesNotMatch(
    list,
    /CSS\.(Translate|Transform)/,
    'no in-flow transform on a map row — the overlay carries the drag',
  );
});

test('the scrollport still scrolls, and the footer cannot be pushed out of it', () => {
  assert.match(list, /data-spine-scrollport[\s\S]{0,220}overflow-y-auto/);
  assert.match(list, /data-spine-account-footer[\s\S]{0,80}shrink-0/);
});

test('a dragged pin row stops transforming; only its siblings shift', () => {
  assert.match(
    cluster,
    /transform:\s*isDragging\s*\?\s*undefined\s*:\s*CSS\.Transform\.toString\(transform\)/,
  );
});
