/**
 * Source guard: non-modal RightRailHost collapse uses the SoT storage key +
 * DS edge-resize `onCollapse` (no page-local twin / raw collapse button).
 *
 * SoT: detail-stack/layout.ts → DETAIL_STACK_COLLAPSE
 * Host: RightRailHost.tsx → HorizontalEdgeResizeHandle.onCollapse
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

test('collapse lives on HorizontalEdgeResizeHandle.onCollapse', () => {
  assert.match(HOST_SRC, /onCollapse=\{/);
  assert.match(HOST_SRC, /HorizontalEdgeResizeHandle/);
  assert.match(HANDLE_SRC, /onCollapse\?:/);
  assert.match(HANDLE_SRC, /edge-resize-collapse/);
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
