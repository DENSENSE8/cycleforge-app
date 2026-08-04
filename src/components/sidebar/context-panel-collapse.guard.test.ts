/**
 * Source guard: every context-panel rail collapses via the SoT storage key +
 * filter-bar `RailFilterCollapseButton` (primary) and DS edge-resize
 * `onCollapse` / `onCollapseBeyondMin` (secondary) — no page-local twin / raw
 * collapse button / restored ContextPanelCollapseCue; not gated to receiving
 * routes.
 *
 * SoT: context-panel-column.ts → CONTEXT_PANEL_COLLAPSE
 * Layout: ContextPanelLayout.tsx → HorizontalEdgeResizeHandle.onCollapse
 *         + useHorizontalEdgeResize.onCollapseBeyondMin
 *         + ContextPanelCollapseProvider
 * Filter: ReceivingSidebarPanel → TechRailSearchBar.trailingAction
 * Edge: design-system/components/HorizontalEdgeResizeHandle.tsx
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/context-panel-collapse.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONTEXT_PANEL_COLLAPSE,
  CONTEXT_PANEL_OUTER_MARGIN,
  CONTEXT_PANEL_OUTER_MARGIN_Y,
} from '@/components/sidebar/context-panel-column';

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

test('retired outer-margin tokens stay named for docs / migration', () => {
  assert.equal(CONTEXT_PANEL_OUTER_MARGIN, 'm-2');
  assert.equal(CONTEXT_PANEL_OUTER_MARGIN_Y, 'my-2');
});

test('context-panel-column exports collapse strip class + tokens', () => {
  assert.match(COLUMN_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_CLASS/);
  assert.match(COLUMN_SRC, /CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS/);
  assert.match(COLUMN_SRC, /storageKey:\s*'context-panel-collapsed'/);
});

test('ContextPanelLayout persists via CONTEXT_PANEL_COLLAPSE.storageKey', () => {
  assert.match(LAYOUT_SRC, /CONTEXT_PANEL_COLLAPSE\.storageKey/);
  assert.match(LAYOUT_SRC, /useLocalStorage/);
  assert.match(LAYOUT_SRC, /LeftDockCollapseStrip/);
  assert.match(LAYOUT_SRC, /context-panel-expand/);
});

test('resize + collapse enable for every mounted context panel (not receiving-only)', () => {
  assert.match(LAYOUT_SRC, /enabled:\s*hasPanel/);
  assert.doesNotMatch(LAYOUT_SRC, /getSidebarRouteKey/);
  assert.doesNotMatch(LAYOUT_SRC, /===\s*['"]receiving['"]/);
});

test('collapse lives on filter trailing + drag-past-min (no sash-top chevron)', () => {
  assert.match(LAYOUT_SRC, /HorizontalEdgeResizeHandle/);
  // Display collapse is filter-bar only — do not wire sash onCollapse here.
  assert.doesNotMatch(LAYOUT_SRC, /onCollapse=\{/);
  assert.doesNotMatch(LAYOUT_SRC, /ContextPanelCollapseCue/);
  // Handle API still offers onCollapse for other surfaces (right rail).
  assert.match(HANDLE_SRC, /onCollapse\?:/);
  assert.match(HANDLE_SRC, /edge-resize-collapse/);
});

test('drag-past-min collapse wires onCollapseBeyondMin into CONTEXT_PANEL_COLLAPSE', () => {
  assert.match(LAYOUT_SRC, /onCollapseBeyondMin:/);
  assert.match(LAYOUT_SRC, /collapseBelowPx:/);
  assert.match(LAYOUT_SRC, /EDGE_RESIZE_COLLAPSE_SLACK_PX/);
  assert.match(LAYOUT_SRC, /setCollapsed\(true\)/);
  // Still no in-feed / cue twin for dismiss.
  assert.doesNotMatch(LAYOUT_SRC, /ContextPanelCollapseCue/);
  assert.doesNotMatch(COLUMN_SRC, /ContextPanelCollapseCue/);
});

test('primary filter-bar collapse: provider + Unbox trailingAction', () => {
  assert.match(LAYOUT_SRC, /ContextPanelCollapseProvider/);
  const panel = code(sourceOf('./ReceivingSidebarPanel.tsx'));
  assert.match(panel, /RailFilterCollapseButton/);
  assert.match(panel, /trailingAction=/);
  assert.match(panel, /useContextPanelCollapse/);
  assert.doesNotMatch(panel, /ContextPanelCollapseCue/);
});

test('left-dock glyph SoT: ArrowLeftToLine collapse + ArrowRightToLine expand at shared size', () => {
  const toggle = code(sourceOf('./tech/left-dock-toggle.tsx'));
  assert.match(toggle, /LEFT_DOCK_TOGGLE_ICON_CLASS\s*=\s*['"]h-3\.5 w-3\.5['"]/);
  assert.match(toggle, /ArrowLeftToLine/);
  assert.match(toggle, /ArrowRightToLine/);
  assert.match(toggle, /export function RailFilterCollapseButton/);
  assert.match(toggle, /function LeftDockExpandButton/);
  assert.match(toggle, /export function LeftDockCollapseStrip/);
  assert.doesNotMatch(toggle, /ChevronRight/);
  assert.equal(
    (toggle.match(/size="xs"/g) ?? []).length,
    2,
    'collapse + expand must both use IconButton size xs',
  );
});

test('collapse / expand affordances use IconButton (not raw buttons)', () => {
  const toggle = code(sourceOf('./tech/left-dock-toggle.tsx'));
  assert.match(toggle, /IconButton/);
  assert.match(HANDLE_SRC, /IconButton/);
  assert.match(HANDLE_SRC, /ChevronLeft/);
  assert.equal(
    (HANDLE_SRC.match(/<button\b/g) ?? []).length,
    0,
    'HorizontalEdgeResizeHandle must not contain a raw <button>',
  );
  assert.equal(
    (toggle.match(/<button\b/g) ?? []).length,
    0,
    'left-dock-toggle must not contain a raw <button>',
  );
});
