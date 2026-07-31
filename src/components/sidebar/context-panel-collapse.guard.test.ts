/**
 * Source guard: receiving context-panel collapse uses the SoT storage key +
 * DS IconButton affordances (no page-local twin / raw collapse button).
 *
 * SoT: context-panel-column.ts → CONTEXT_PANEL_COLLAPSE
 * Layout: ContextPanelLayout.tsx + ContextPanelCollapseCue.tsx
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
const CUE_SRC = code(sourceOf('./ContextPanelCollapseCue.tsx'));
const COLUMN_SRC = code(sourceOf('./context-panel-column.ts'));

test('CONTEXT_PANEL_COLLAPSE storage key is the SoT', () => {
  assert.equal(CONTEXT_PANEL_COLLAPSE.storageKey, 'context-panel-collapsed');
  assert.ok(CONTEXT_PANEL_COLLAPSE.stripWidthPx > 0);
  assert.ok(CONTEXT_PANEL_COLLAPSE.cueOutsetPx > 0);
  assert.ok(CONTEXT_PANEL_COLLAPSE.gutterHitPx > 0);
});

test('context-panel-column exports collapse strip class + tokens', () => {
  assert.match(COLUMN_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_CLASS/);
  assert.match(COLUMN_SRC, /storageKey:\s*'context-panel-collapsed'/);
});

test('ContextPanelLayout persists via CONTEXT_PANEL_COLLAPSE.storageKey', () => {
  assert.match(LAYOUT_SRC, /CONTEXT_PANEL_COLLAPSE\.storageKey/);
  assert.match(LAYOUT_SRC, /useLocalStorage/);
  assert.match(LAYOUT_SRC, /ContextPanelCollapseCue/);
  assert.match(LAYOUT_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_CLASS/);
});

test('collapse / expand affordances use IconButton (not raw buttons)', () => {
  assert.match(LAYOUT_SRC, /IconButton/);
  assert.match(LAYOUT_SRC, /ChevronRight/);
  assert.match(CUE_SRC, /IconButton/);
  assert.match(CUE_SRC, /ChevronLeft/);
  // Cue module must not hand-roll a second collapse control.
  assert.equal(
    (CUE_SRC.match(/<button\b/g) ?? []).length,
    0,
    'ContextPanelCollapseCue must not contain a raw <button>',
  );
});

test('collapse cue resolves rail rows via data-rail-row', () => {
  assert.match(CUE_SRC, /data-rail-row/);
  assert.match(CUE_SRC, /data-context-panel-collapse-gutter/);
});
