/**
 * Source guard: recent-rail / scoped-search trailing icon grammar.
 *
 * SoT (`TechRailSearchBar` + `SearchField`):
 * 1. Empty-field paste — hover-reveal only (opacity-0 until group-hover /
 *    group-hover/search-bar)
 * 2. Field-density filters — `trailingSuffix` (after paste; paste leads)
 * 3. Age-column collapse — auto from `useContextPanelCollapse` on rail variant
 * 4. Paste · filter · collapse share a 24px control / 14px glyph box and one
 *    vertically-centered row
 *
 * Never seat a WorkbenchFilterPopover / rail facet filter in `trailingPrefix`
 * on TechRailSearchBar (or the SearchField hosts that share this grammar for
 * filters). `trailingPrefix` remains for non-filter CTAs that must lead paste.
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/tech/rail-search-trailing.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SEARCH_BAR = code(sourceOf('./TechRailSearchBar.tsx'));
const SEARCH_FIELD = code(
  sourceOf('../../../design-system/primitives/SearchField.tsx'),
);
const FILTER_POPOVER = code(
  sourceOf('../../dashboard/workbench-filter-popover.tsx'),
);
const LEFT_DOCK_TOGGLE = code(sourceOf('./left-dock-toggle.tsx'));

test('TechRailSearchBar auto-wires context-panel collapse on rail variant', () => {
  assert.match(SEARCH_BAR, /useContextPanelCollapse/);
  assert.match(SEARCH_BAR, /RailFilterCollapseButton/);
  assert.match(SEARCH_BAR, /trailingAction !== undefined/);
  assert.match(SEARCH_BAR, /trailingSuffix/);
});

test('SearchField empty-field paste is hover-reveal only', () => {
  assert.match(SEARCH_FIELD, /opacity-0/);
  assert.match(SEARCH_FIELD, /group-hover\/search-bar:opacity-100/);
  assert.match(SEARCH_FIELD, /Paste from clipboard/);
});

test('SearchField trailing order is prefix → control → suffix (paste leads filters)', () => {
  const idxPrefix = SEARCH_FIELD.indexOf('{trailingPrefix}');
  const idxControl = SEARCH_FIELD.indexOf('{trailingControl}');
  const idxSuffix = SEARCH_FIELD.indexOf('{trailingSuffix}');
  assert.ok(idxPrefix >= 0 && idxControl >= 0 && idxSuffix >= 0);
  assert.ok(
    idxPrefix < idxControl && idxControl < idxSuffix,
    'trailing slot must render prefix → paste/clear → suffix',
  );
});

test('paste · filter · collapse share one control and glyph size', () => {
  assert.match(
    SEARCH_FIELD,
    /inline-flex h-6 w-6 shrink-0 items-center justify-center[\s\S]*?<Clipboard className="h-3\.5 w-3\.5"/,
    'paste must use the 24px control / 14px glyph rail-action box',
  );
  assert.match(
    FILTER_POPOVER,
    /inline-flex h-6 w-6 shrink-0 items-center justify-center/,
    'field-density filter must use the 24px rail-action box',
  );
  assert.match(FILTER_POPOVER, /<Filter className="h-3\.5 w-3\.5"/);
  assert.match(FILTER_POPOVER, /focusable=\{false\} asChild/);
  assert.match(
    FILTER_POPOVER,
    /inline-flex h-3\.5 w-3\.5 items-center justify-center leading-none/,
    'filter tooltip trigger must not introduce an inline-baseline wrapper',
  );
  assert.match(LEFT_DOCK_TOGGLE, /LEFT_DOCK_TOGGLE_ICON_CLASS = 'h-3\.5 w-3\.5'/);
  assert.match(LEFT_DOCK_TOGGLE, /size="xs"/);
  assert.match(SEARCH_FIELD, /flex shrink-0 items-center gap-0\.5/);
  assert.match(SEARCH_BAR, /flex min-w-0 items-center gap-0\.5/);
  assert.match(SEARCH_BAR, /cn\('-ml-1', SIDEBAR_RAIL_TRAILING_TRACK_CLASS\)/);
});

test('Receiving rail facets seat in trailingSuffix (paste-left)', () => {
  const panel = code(sourceOf('../ReceivingSidebarPanel.tsx'));
  const filters = code(sourceOf('../receiving/UnboxRecentRailFilters.tsx'));
  assert.match(panel, /trailingSuffix=\{/);
  assert.match(panel, /ReceivingRecentRailFilters/);
  assert.doesNotMatch(
    panel,
    /trailingPrefix=\{[\s\S]*ReceivingRecentRailFilters/,
    'Receiving facets must not sit left of paste via trailingPrefix',
  );
  assert.match(filters, /label="All types"[\s\S]*?sectionHeader/);
  assert.match(filters, /label="All platforms"[\s\S]*?sectionHeader/);
  assert.doesNotMatch(filters, /WorkbenchFilterGroupLabel>Type/);
  assert.doesNotMatch(filters, /WorkbenchFilterGroupLabel>Platform/);
});

test('field-density filter hosts use trailingSuffix not trailingPrefix', () => {
  const ecwid = code(
    sourceOf('../../receiving/unfound/ecwid-search/EcwidSearchInputs.tsx'),
  );
  assert.match(ecwid, /trailingSuffix=\{<EcwidOrderScopeFilters/);
  assert.doesNotMatch(ecwid, /trailingPrefix=\{<EcwidOrderScopeFilters/);

  const search = code(sourceOf('../../search/SearchFindStage.tsx'));
  assert.match(search, /trailingSuffix=\{/);
  assert.match(search, /SearchRefineControls/);
  assert.doesNotMatch(
    search,
    /trailingPrefix=\{[\s\S]*SearchRefineControls/,
  );
});

test('station recent-rail footers compose TechRailSearchBar (no local twin)', () => {
  for (const panel of [
    '../ReceivingSidebarPanel.tsx',
    '../TestingSidebarPanel.tsx',
    '../ShippingSidebarPanel.tsx',
    '../PackerSidebarPanel.tsx',
    '../receiving/TriageCartonSearchBar.tsx',
  ]) {
    const src = code(sourceOf(panel));
    assert.match(src, /TechRailSearchBar/, `${panel} must use TechRailSearchBar`);
  }
});

test('every station/page recent-rail footer mounts a trailingSuffix filter', () => {
  const mounts: Array<{ file: string; filter: RegExp }> = [
    { file: '../ReceivingSidebarPanel.tsx', filter: /ReceivingRecentRailFilters/ },
    { file: '../TestingSidebarPanel.tsx', filter: /ReceivingRecentRailFilters/ },
    { file: '../ShippingSidebarPanel.tsx', filter: /StationHistoryRailFilters/ },
    { file: '../PackerSidebarPanel.tsx', filter: /StationHistoryRailFilters/ },
    {
      file: '../../labels/ProductLabelsRecentRail.tsx',
      filter: /LabelPrintRailFilters/,
    },
    {
      file: '../../support/zendesk/queue/SupportTicketsRecentRail.tsx',
      filter: /SupportRecentRailFilters/,
    },
    {
      file: '../../outbound/labels/LabelsRecentRail.tsx',
      filter: /StationHistoryRailFilters/,
    },
    {
      file: '../ReceivingSidebarPanel.tsx',
      filter: /PickupRailFilters/,
    },
  ];
  for (const { file, filter } of mounts) {
    const src = code(sourceOf(file));
    assert.match(src, /trailingSuffix=\{/, `${file} must seat filter in trailingSuffix`);
    assert.match(src, filter, `${file} must mount ${filter}`);
  }
  const triage = code(sourceOf('../receiving/TriageCartonSearchBar.tsx'));
  assert.match(triage, /trailingSuffix/);
});
