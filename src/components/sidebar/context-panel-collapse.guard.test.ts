/**
 * Source guard: receiving context-panel collapse uses the SoT storage key +
 * DS edge-resize `onCollapse` (no page-local twin / raw collapse button /
 * restored ContextPanelCollapseCue).
 *
 * SoT: context-panel-column.ts → CONTEXT_PANEL_COLLAPSE
 * Layout: ContextPanelLayout.tsx → HorizontalEdgeResizeHandle.onCollapse
 * Edge: design-system/components/HorizontalEdgeResizeHandle.tsx
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/context-panel-collapse.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTEXT_PANEL_COLLAPSE } from '@/components/sidebar/context-panel-column';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const LAYOUT_SRC = code(sourceOf('./ContextPanelLayout.tsx'));
const COLUMN_SRC = code(sourceOf('./context-panel-column.ts'));
const HANDLE_SRC = code(
  sourceOf('../../design-system/components/HorizontalEdgeResizeHandle.tsx'),
);

test('CONTEXT_PANEL_COLLAPSE storage key is the SoT', () => {
  assert.equal(CONTEXT_PANEL_COLLAPSE.storageKey, 'context-panel-collapsed');
  assert.ok(CONTEXT_PANEL_COLLAPSE.stripWidthPx > 0);
});

test('context-panel-column exports collapse strip class + tokens', () => {
  assert.match(COLUMN_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_CLASS/);
  assert.match(COLUMN_SRC, /storageKey:\s*'context-panel-collapsed'/);
});

test('ContextPanelLayout persists via CONTEXT_PANEL_COLLAPSE.storageKey', () => {
  assert.match(LAYOUT_SRC, /CONTEXT_PANEL_COLLAPSE\.storageKey/);
  assert.match(LAYOUT_SRC, /useLocalStorage/);
  assert.match(LAYOUT_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_CLASS/);
});

test('collapse lives on HorizontalEdgeResizeHandle.onCollapse (not a cue twin)', () => {
  assert.match(LAYOUT_SRC, /onCollapse=\{/);
  assert.match(LAYOUT_SRC, /HorizontalEdgeResizeHandle/);
  assert.doesNotMatch(LAYOUT_SRC, /ContextPanelCollapseCue/);
  assert.match(HANDLE_SRC, /onCollapse\?:/);
  assert.match(HANDLE_SRC, /edge-resize-collapse/);
});

test('collapse / expand affordances use IconButton (not raw buttons)', () => {
  assert.match(LAYOUT_SRC, /IconButton/);
  assert.match(LAYOUT_SRC, /ChevronRight/);
  assert.match(HANDLE_SRC, /IconButton/);
  assert.match(HANDLE_SRC, /ChevronLeft/);
  assert.equal(
    (HANDLE_SRC.match(/<button\b/g) ?? []).length,
    0,
    'HorizontalEdgeResizeHandle must not contain a raw <button>',
  );
});
