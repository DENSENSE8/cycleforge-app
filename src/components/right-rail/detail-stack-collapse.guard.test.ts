/**
 * Source guard: non-modal RightRailHost collapse parks via DETAIL_STACK_COLLAPSE
 * + Band 3 / header `→|` — never a sash-top `onCollapse` chevron twin of close.
 *
 * Hairline = drag-to-resize only (`useHorizontalEdgeResize` +
 * `HorizontalEdgeResizeHandle` without `onCollapse`). Unbox Displays
 * (`StationDisplaysPushColumn`) is the golden twin.
 *
 * SoT: detail-stack/layout.ts → DETAIL_STACK_COLLAPSE
 * Host: RightRailHost.tsx
 *
 * Run: node --test --import tsx \
 *        src/components/right-rail/detail-stack-collapse.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DETAIL_STACK_COLLAPSE } from '@/design-system/shells/detail-stack';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const HOST_SRC = code(sourceOf('./RightRailHost.tsx'));
const LAYOUT_SRC = code(
  sourceOf('../../design-system/shells/detail-stack/layout.ts'),
);
const HANDLE_SRC = code(
  sourceOf('../../design-system/components/HorizontalEdgeResizeHandle.tsx'),
);

test('DETAIL_STACK_COLLAPSE storage key is the SoT', () => {
  assert.equal(DETAIL_STACK_COLLAPSE.storageKey, 'detail-inspector-collapsed');
  assert.ok(DETAIL_STACK_COLLAPSE.stripWidthPx > 0);
});

test('detail-stack layout exports collapse strip helpers + tokens', () => {
  assert.match(LAYOUT_SRC, /DETAIL_STACK_COLLAPSE/);
  assert.match(LAYOUT_SRC, /detailStackCollapseStripClassName/);
  assert.match(LAYOUT_SRC, /detailStackCollapseStripStyle/);
  assert.match(LAYOUT_SRC, /storageKey:\s*'detail-inspector-collapsed'/);
});

test('RightRailHost persists via DETAIL_STACK_COLLAPSE.storageKey', () => {
  assert.match(HOST_SRC, /DETAIL_STACK_COLLAPSE\.storageKey/);
  assert.match(HOST_SRC, /useLocalStorage/);
  assert.match(HOST_SRC, /detailStackCollapseStripClassName/);
  assert.match(HOST_SRC, /detail-inspector-expand/);
});

test('RightRailHost syncs same-tab collapse via DETAIL_INSPECTOR_COLLAPSE_EVENT', () => {
  assert.match(HOST_SRC, /DETAIL_INSPECTOR_COLLAPSE_EVENT/);
  const control = code(
    sourceOf('../../design-system/shells/detail-stack/collapse-control.ts'),
  );
  assert.match(control, /detail-inspector-collapsed-change/);
  assert.match(control, /toggleDetailInspectorCollapsed/);
});

test('hairline is the panel seam — inset, no sash onCollapse twin of →|', () => {
  // Display hairline = panel border-l; hit sash inside the card (inset).
  // No outset overhang into the work surface; sash is drag-only (park = →|).
  assert.match(HOST_SRC, /HorizontalEdgeResizeHandle/);
  assert.match(HOST_SRC, /useHorizontalEdgeResize/);
  assert.match(HOST_SRC, /placement="inset"/);
  assert.equal(
    /placement="outset"/.test(HOST_SRC),
    false,
    'RightRailHost must use inset (panel seam), not outset overhang',
  );
  assert.equal(
    /onCollapse=\{/.test(HOST_SRC),
    false,
    'RightRailHost must not pass onCollapse to HorizontalEdgeResizeHandle',
  );
  assert.equal(
    /collapseLabel=/.test(HOST_SRC),
    false,
    'RightRailHost must not pass collapseLabel (chevron twin of →|)',
  );
  // Inset hit is full-height on the panel seam (no top-8 cutoff — that
  // shortened the display hairline under the header). Sash is z-sticky
  // (above body z-raised hairlines); chrome owns `→|` at z-header.
  assert.match(HANDLE_SRC, /z-sticky/);
  assert.match(HANDLE_SRC, /left-0 justify-start/);
  assert.equal(
    /INSET_CHROME_CLEARANCE|top-8 bottom-0/.test(HANDLE_SRC),
    false,
    'inset hairline must be flush top→bottom; never top-8 chrome clearance on the paint',
  );
  assert.doesNotMatch(HANDLE_SRC, /onCollapse/);
  assert.doesNotMatch(HANDLE_SRC, /edge-resize-collapse/);
});

test('Incoming details opts out of host park strip (collapsedStrip=false)', () => {
  const panel = code(
    sourceOf('../sidebar/receiving/IncomingDetailsPanel.tsx'),
  );
  assert.match(panel, /collapsedStrip=\{false\}/);
});

test('push column snaps instantly — Unbox Displays / context-rail twin', () => {
  // Open ↔ park is a one-frame style.width write, never motionRole.push.rail.
  assert.match(HOST_SRC, /data-right-rail-mode="push"/);
  assert.match(HOST_SRC, /width,/);
  assert.equal(
    /motionRole\.push\.rail/.test(HOST_SRC),
    false,
    'desk push must not tween width — Station Displays is the golden',
  );
  assert.equal(
    /pushWidthSettled|pushWidthTransition|pushTransition|pushPresence/.test(HOST_SRC),
    false,
    'push width-settled tween gate is retired',
  );
  // Push branch is a plain <aside>; overlay alone keeps motion.aside.
  assert.match(HOST_SRC, /<aside\b/);
  assert.match(HOST_SRC, /data-right-rail-mode="overlay"/);
  // Mid-drag must not thrash desiredWidthPx.
  assert.match(HOST_SRC, /publishedDesireRef/);
});
test('collapse / expand affordances use IconButton (not raw buttons)', () => {
  assert.match(HOST_SRC, /IconButton/);
  assert.match(HOST_SRC, /ChevronLeft/);
  assert.equal(
    (HOST_SRC.match(/<button\b/g) ?? []).length,
    0,
    'RightRailHost must not contain a raw <button>',
  );
});
