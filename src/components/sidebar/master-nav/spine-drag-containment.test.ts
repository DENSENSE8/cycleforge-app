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

/**
 * The unpin decision is GEOMETRY (operator 2026-09-06): the pointer's position
 * against the shelf rect — measured at drag START — decides unpin vs reorder.
 * The old chain let dnd-kit's closestCenter fallback report a pin ROW for a
 * release over open map, silently turning an unpin into a reorder. The rect is
 * cleared only AFTER the resolution reads it (the null-before-read bug shipped
 * once and made every drop an unpin and every pin impossible).
 */
test('unpin is resolved by shelf geometry, and the rect outlives the resolution', () => {
  assert.match(list, /pointerOutsideShelf\(event, shelfRect\)/);
  assert.match(list, /const shelfRect = shelfRectRef\.current;\s*\n\s*shelfRectRef\.current = null;/);
  // The rect is measured when the gesture STARTS, not when it ends.
  assert.match(list, /shelfRectRef\.current = shelfElRef\.current\?\.getBoundingClientRect\(\)/);
  // The promise is painted over everything below the shelf, before the release.
  assert.match(list, /data-unpin-overlay/);
  assert.match(list, /Release to unpin/);
  // Nav drags mirror it: pinning requires the pointer INSIDE the shelf.
  assert.match(list, /Pinning a map row requires the pointer INSIDE the shelf/);
});
