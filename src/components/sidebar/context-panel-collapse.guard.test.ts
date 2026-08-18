/**
 * Source guard: every context-panel rail collapses via the SoT storage key +
 * filter-bar `RailFilterCollapseButton` (primary) and DS edge-resize
 * `onCollapseBeyondMin` (secondary) — no sash-top chevron / page-local twin /
 * raw collapse button / restored ContextPanelCollapseCue; not gated to
 * receiving routes.
 *
 * SoT: context-panel-column.ts → CONTEXT_PANEL_COLLAPSE
 * Layout: ContextPanelLayout.tsx → HorizontalEdgeResizeHandle (drag-only)
 *         + useHorizontalEdgeResize.onCollapseBeyondMin
 *         + ContextPanelCollapseProvider
 * Filter: TechRailSearchBar auto-seats RailFilterCollapseButton under
 *         ContextPanelCollapseProvider (Receiving / Testing / Shipping /
 *         Packer / Triage / Dashboard footers inherit — no per-panel twin)
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
  assert.equal(CONTEXT_PANEL_COLLAPSE.mruPinCount, 5);
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
  assert.match(LAYOUT_SRC, /CollapseStripMruPins/);
  assert.match(LAYOUT_SRC, /CollapseStripScanCell/);
  assert.match(LAYOUT_SRC, /ContextPanelCollapseStripSlot/);
});

test('resize + collapse enable for every mounted context panel (not receiving-only)', () => {
  assert.match(LAYOUT_SRC, /enabled:\s*hasPanel/);
  assert.doesNotMatch(LAYOUT_SRC, /getSidebarRouteKey/);
  assert.doesNotMatch(LAYOUT_SRC, /===\s*['"]receiving['"]/);
});

test('collapse lives on filter trailing + drag-past-min (sash is drag-only)', () => {
  assert.match(LAYOUT_SRC, /HorizontalEdgeResizeHandle/);
  // Resize sash must not grow a sash-top collapse chevron.
  assert.doesNotMatch(LAYOUT_SRC, /collapseLabel=/);
  assert.doesNotMatch(
    LAYOUT_SRC,
    /HorizontalEdgeResizeHandle[\s\S]*?onCollapse=\{/,
  );
  assert.match(
    LAYOUT_SRC,
    /placement="inset"/,
    'Context rail hairline must be inset on the panel border-r — not an outset twin to the right',
  );
  assert.doesNotMatch(LAYOUT_SRC, /ContextPanelCollapseCue/);
  assert.doesNotMatch(HANDLE_SRC, /onCollapse/);
  assert.doesNotMatch(HANDLE_SRC, /edge-resize-collapse/);
  assert.doesNotMatch(HANDLE_SRC, /ChevronLeft|ChevronRight/);
  assert.match(
    HANDLE_SRC,
    /w-1 self-stretch/,
    'Hover paint must be a 4px industry sash highlight, not a 1px twin',
  );
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

test('park/restore snaps — no push.rail width tween (Displays twin)', () => {
  // Instant width via style — never motion.div / motionRole.push.rail.
  assert.match(LAYOUT_SRC, /style=\{\{\s*width: isCollapsed \? 0 : paintWidthPx\s*\}\}/);
  assert.doesNotMatch(LAYOUT_SRC, /motionRole\.push\.rail/);
  assert.doesNotMatch(LAYOUT_SRC, /from '@\/design-system\/motion'/);
  assert.doesNotMatch(LAYOUT_SRC, /widthTransition|collapseSettled/);
  // Mid-drag cost must not re-publish into the park ladder.
  assert.match(LAYOUT_SRC, /publishedCostRef/);
  assert.match(LAYOUT_SRC, /if \(!isDragging\)/);
});

test('recent rail: no Framer layout projection on column resize (Displays twin)', () => {
  const railRow = code(sourceOf('./rail-shell/RailRow.tsx'));
  const shell = code(sourceOf('./SidebarRailShell.tsx'));
  // layout={…} FLIPs every row when context width changes — rubber-band.
  assert.doesNotMatch(
    railRow,
    /\blayout=\{/,
    'RailRow must not enable Framer layout — sash / dual-rail resize must snap',
  );
  assert.doesNotMatch(
    shell,
    /mode=["']popLayout["']/,
    'popLayout projects sibling layout and lags column resize; use sync',
  );
  assert.match(shell, /mode=["']sync["']/);
});

test('primary filter-bar collapse: provider + TechRailSearchBar auto-wire', () => {
  assert.match(LAYOUT_SRC, /ContextPanelCollapseProvider/);
  assert.match(LAYOUT_SRC, /expand=\{expand\}/);
  assert.match(LAYOUT_SRC, /toggle=\{toggle\}/);
  const searchBar = code(sourceOf('./tech/TechRailSearchBar.tsx'));
  assert.match(searchBar, /useContextPanelCollapse/);
  assert.match(searchBar, /RailFilterCollapseButton/);
  assert.match(searchBar, /resolvedTrailingAction/);
  // Station recent rails inherit collapse — do not re-wire per panel.
  const receiving = code(sourceOf('./ReceivingSidebarPanel.tsx'));
  assert.doesNotMatch(receiving, /RailFilterCollapseButton/);
  assert.doesNotMatch(receiving, /useContextPanelCollapse/);
  assert.doesNotMatch(receiving, /ContextPanelCollapseCue/);
  for (const panel of [
    './TestingSidebarPanel.tsx',
    './ShippingSidebarPanel.tsx',
    './PackerSidebarPanel.tsx',
  ]) {
    const src = code(sourceOf(panel));
    assert.match(src, /TechRailSearchBar/);
    assert.doesNotMatch(
      src,
      /RailFilterCollapseButton/,
      `${panel} must inherit collapse from TechRailSearchBar, not fork a twin`,
    );
  }
});

test('left-dock glyph SoT: ArrowLeftToLine collapse + ArrowRightToLine expand at shared size', () => {
  const toggle = code(sourceOf('./tech/left-dock-toggle.tsx'));
  assert.match(toggle, /LEFT_DOCK_TOGGLE_ICON_CLASS\s*=\s*['"]h-3\.5 w-3\.5['"]/);
  assert.match(toggle, /ArrowLeftToLine/);
  assert.match(toggle, /ArrowRightToLine/);
  assert.match(toggle, /export function RailFilterCollapseButton/);
  assert.match(toggle, /function LeftDockExpandButton/);
  assert.match(toggle, /export function LeftDockCollapseStrip/);
  assert.match(toggle, /export function CollapseStripMruPins/);
  assert.doesNotMatch(toggle, /ChevronRight/);
  // collapse + expand + MRU pin template + overflow +N — all IconButton size xs
  assert.equal(
    (toggle.match(/size="xs"/g) ?? []).length,
    4,
    'collapse + expand + MRU pin + overflow must use IconButton size xs',
  );
});

test('parked strip: whole-strip click expands; MRU pins stopPropagation', () => {
  const toggle = code(sourceOf('./tech/left-dock-toggle.tsx'));
  assert.match(toggle, /onClick=\{onExpand\}/);
  assert.match(toggle, /role="button"/);
  assert.match(toggle, /onKeyDown=\{onStripKeyDown\}/);
  assert.match(toggle, /cursor-pointer/);
  assert.match(toggle, /e\.stopPropagation\(\)/);
  assert.match(toggle, /CONTEXT_PANEL_COLLAPSE\.mruPinCount/);
  // Selected pin matches open-rail RailRow ring language.
  assert.match(toggle, /ring-blue-400/);
  assert.match(toggle, /aria-current=\{pin\.selected/);
  // Double-click pin expands; single click selects (stay collapsed).
  assert.match(toggle, /onDoubleClick/);
  assert.match(toggle, /onExpand\(\)/);
  // +N overflow when open rail has more than mruPinCount.
  assert.match(toggle, /data-collapse-strip-overflow/);
  assert.match(toggle, /totalCount/);
  // Dense identity peek on pin hover (title · meta · status · age) when the
  // feed has no renderPopover; otherwise the open-rail RailPopover card.
  assert.match(toggle, /data-collapse-strip-peek/);
  assert.match(toggle, /data-collapse-strip-rail-peek/);
  assert.match(toggle, /useRailHoverPreview/);
  assert.match(toggle, /RailPopover/);
  assert.match(toggle, /pin\.renderPeek/);
  assert.match(toggle, /pin\.meta/);
  assert.match(toggle, /pin\.age/);
});

test('collapse MRU publish is shell default + Dashboard thin-wires', () => {
  const ctx = code(sourceOf('./context-panel-collapse-context.tsx'));
  assert.match(ctx, /export function usePublishCollapsePins/);
  assert.match(ctx, /setCollapseMru/);
  assert.match(ctx, /CollapseMruSnapshot/);
  assert.match(ctx, /totalCount/);
  assert.match(ctx, /meta\?:/);
  assert.match(ctx, /age\?:/);
  assert.match(ctx, /selected\?:/);
  assert.match(ctx, /renderPeek\?:/);
  const shell = code(sourceOf('./SidebarRailShell.tsx'));
  assert.match(shell, /usePublishCollapsePins/);
  assert.match(shell, /publishCollapseMru/);
  assert.match(shell, /getCollapsePinLabel/);
  assert.match(shell, /getCollapsePinMeta/);
  assert.match(shell, /railRelativeTime/);
  assert.match(shell, /totalCount:\s*rows\.length/);
  // Parked pins always peek a card: the rail's own popover when it has one,
  // else the shared RailPeekCard (copyable id chips · Open →) — never text-only.
  assert.match(shell, /renderPeek:/);
  assert.match(shell, /RailPeekCard/);
  assert.match(shell, /getCollapsePinFacts/);
  assert.match(shell, /grouped\[i\]\?\.groupSize/);
  const peekCard = code(sourceOf('./rail-shell/RailPeekCard.tsx'));
  assert.match(peekCard, /export function RailPeekCard/);
  assert.match(peekCard, /export type \{ RailPeekFact \}/);
  assert.match(peekCard, /RailPeekIdentityFacts/);
  // Copy affordance is the point — typed CopyChip faces live on the shared
  // identity-facts SoT (header + stacked rows), not a card-local wrap strip.
  const peekFacts = code(sourceOf('./rail-shell/RailPeekIdentityFacts.tsx'));
  for (const chip of ['OrderIdChip', 'PoChip', 'SkuScanRefChip', 'TrackingChip', 'SerialChip', 'TicketChip', 'BinChip']) {
    assert.match(peekFacts, new RegExp(chip), `RailPeekIdentityFacts must render ${chip}`);
  }
  // Every pin-publishing rail without its own popover supplies typed facts.
  for (const rail of [
    './packer/PackRecentPacksRail.tsx',
    './shipping/ShippingStaffScanHistoryRail.tsx',
    '../outbound/labels/LabelsRecentRail.tsx',
    '../receiving/pickup/PickupSidebarRail.tsx',
  ]) {
    assert.match(
      code(sourceOf(rail)),
      /getCollapsePinFacts/,
      `${rail} must publish copyable peek facts`,
    );
  }
  const recentBase = code(sourceOf('./rail-shell/SidebarRecentRailBase.tsx'));
  assert.match(recentBase, /publishCollapseMru\s*=\s*true/);
  // Receiving domain does not keep a feed-id allowlist or local publish twin.
  const recent = code(sourceOf('./receiving/RecentActivityRailBase.tsx'));
  assert.doesNotMatch(recent, /usePublishCollapsePins/);
  assert.match(recent, /getCollapsePinLabel/);
  assert.match(recent, /getCollapsePinMeta/);
  const feed = code(sourceOf('./receiving/ReceivingFeedRail.tsx'));
  assert.doesNotMatch(feed, /publishCollapseMru/);
  const dashboard = code(sourceOf('./dashboard/DashboardRecentsPanel.tsx'));
  assert.match(dashboard, /usePublishCollapsePins/);
  assert.match(dashboard, /totalCount:\s*entries\.length/);
  // Dashboard publishes thin, but peeks the same copy card as the shell rails.
  assert.match(dashboard, /RailPeekCard/);
  // Layout passes onExpand + totalCount into MRU pins.
  assert.match(LAYOUT_SRC, /CollapseStripMruPins[\s\S]*onExpand=\{onExpand\}/);
  assert.match(LAYOUT_SRC, /totalCount=\{collapseMru\.totalCount\}/);
});

test('parked strip mini scan: publish from StationScanBar + Plus idle cell', () => {
  const ctx = code(sourceOf('./context-panel-collapse-context.tsx'));
  assert.match(ctx, /export type CollapseStripScan/);
  assert.match(ctx, /export function usePublishCollapseScan/);
  assert.match(ctx, /setCollapseScan/);
  assert.match(ctx, /bottomRuleClass/);
  assert.match(ctx, /hoverClass/);
  assert.match(ctx, /theme:\s*StationTheme/);

  const scanBar = code(sourceOf('../station/scan-bar/StationScanBar.tsx'));
  assert.match(scanBar, /usePublishCollapseScan/);
  assert.match(scanBar, /showHotkeyGear/);
  assert.match(scanBar, /STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS/);
  assert.match(scanBar, /theme:\s*collapseTheme/);
  // Secondary fields stay quiet — publish gates on hotkey primary.
  assert.match(scanBar, /showHotkeyGear[\s\S]*\?[\s\S]*bottomRuleClass/);
  // Focus glow stays on ScanBandGlowHost — no second pulse twin on the open bar.
  assert.doesNotMatch(scanBar, /ScanBarFocusRulePulse/);

  const tokens = code(sourceOf('../station/scan-bar/tokens.ts'));
  assert.match(tokens, /STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS/);
  assert.match(tokens, /STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS/);

  const cell = code(sourceOf('./tech/collapse-strip-scan-cell.tsx'));
  assert.match(cell, /export function CollapseStripScanCell/);
  assert.match(cell, /data-collapse-strip-scan/);
  assert.match(cell, /data-collapse-strip-scan-idle/);
  assert.match(cell, /Plus/);
  // Full-bleed h-10 — same band as StationScanBar / StationContextBar top row.
  assert.match(cell, /SCAN_CELL_HEIGHT_CLASS = PRIMARY_CHROME_ROW_FACE/);
  assert.match(cell, /ds-allow-control-size/);
  assert.match(cell, /ds-raw-button/);
  assert.match(cell, /useRegisterScanTarget/);
  // Same bottom-up glow as the open band + visible caret (no placeholder).
  assert.match(cell, /ScanBandGlowHost/);
  assert.match(cell, /placeholder=""/);
  assert.doesNotMatch(cell, /caret-transparent/);
  assert.doesNotMatch(cell, /text-transparent/);

  // Layout seats the cell above MRU when a session is published — no per-rail fork.
  assert.match(LAYOUT_SRC, /collapseScan/);
  assert.match(LAYOUT_SRC, /CollapseStripScanCell/);
  assert.doesNotMatch(
    code(sourceOf('./receiving/RecentActivityRailBase.tsx')),
    /usePublishCollapseScan/,
  );
  assert.doesNotMatch(
    code(sourceOf('./rail-shell/SidebarRecentRailBase.tsx')),
    /usePublishCollapseScan/,
  );
});

test('collapse / expand affordances use IconButton (not raw buttons)', () => {
  const toggle = code(sourceOf('./tech/left-dock-toggle.tsx'));
  assert.match(toggle, /IconButton/);
  // Mini scan cell is a sanctioned full-bleed h-10 hit target (scan-band height),
  // not an IconButton size token — must keep the ds-raw-button escape.
  const scanCell = code(sourceOf('./tech/collapse-strip-scan-cell.tsx'));
  assert.match(scanCell, /ds-raw-button/);
  // Resize sash is drag-only — no IconButton / chevron collapse twin.
  assert.doesNotMatch(HANDLE_SRC, /IconButton/);
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
