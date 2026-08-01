/**
 * Source guard: L2 Mode + Recents + Pins live in GlobalHeader for every modeful page.
 * Pins the XOR — header mounts Mode/Recents/Pins; sidebar panels must not remount a
 * page-L2 mode rail twin. Nested facet sliders are OK. Avatar Quick Access must not
 * remount a pin list (pins = HeaderPinsSwitcher / useQuickAccess).
 *
 * SoT: SIDEBAR_PAGE_NAV + useSidebarModeNav · HeaderModeSwitcher · HeaderRecentsSwitcher
 *      · HeaderPinsSwitcher / useQuickAccess
 * Display law: .claude/rules/display/workbench.md (L2 in GlobalHeader)
 *
 * Run: node --test --import tsx \
 *        src/components/layout/header-mode.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSidebarPageNav, SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const HEADER = code(sourceOf('./GlobalHeader.tsx'));
const MODE = code(sourceOf('./HeaderModeSwitcher.tsx'));
const RECENTS = code(sourceOf('./HeaderRecentsSwitcher.tsx'));
const PINS = code(sourceOf('./HeaderPinsSwitcher.tsx'));
const HEADER_SHELL = code(sourceOf('./header-shell.ts'));
const QUICK_ACCESS_POPOVER = code(sourceOf('../quick-access/QuickAccessPopover.tsx'));
const MASTER_HEADER = code(sourceOf('../sidebar/master-nav/MasterNavHeader.tsx'));
const MASTER_NAV = code(sourceOf('../sidebar/master-nav/MasterNav.tsx'));
const MASTER_VIEW = code(sourceOf('../sidebar/master-nav/MasterNavView.tsx'));

const PANEL_SOURCES = [
  '../sidebar/ReceivingSidebarPanel.tsx',
  '../sidebar/OutboundSidebarPanel.tsx',
  '../sidebar/ProductsSidebarPanel.tsx',
  '../sidebar/TechSidebarPanel.tsx',
  '../sidebar/PackerSidebarPanel.tsx',
  '../sidebar/InventorySidebarPanel.tsx',
  '../sidebar/SourcingSidebarPanel.tsx',
  '../sidebar/WarehouseSidebarPanel.tsx',
  '../sidebar/SupportSidebarPanel.tsx',
  '../sidebar/OperationsSidebarPanel.tsx',
] as const;

test('SIDEBAR_PAGE_NAV has multiple modeful pages for the header Mode control', () => {
  const modeful = SIDEBAR_PAGE_NAV.filter((p) => (p.modes?.length ?? 0) > 1);
  assert.ok(modeful.length >= 8, `expected ≥8 modeful pages, got ${modeful.length}`);
  // Receiving family L1 pages are modeless; legacy `receiving` keeps mode
  // resolution for deep-links. Shipping stays modeful in the header.
  assert.equal(getSidebarPageNav('receive')?.modes, undefined);
  assert.ok(getSidebarPageNav('receiving')?.modes?.some((m) => m.id === 'receive'));
  assert.ok(getSidebarPageNav('outbound')?.modes?.some((m) => m.id === 'labels'));
  assert.equal(
    getSidebarPageNav('outbound')?.modes?.some((m) => m.id === 'scan-out'),
    false,
  );
  assert.equal(getSidebarPageNav('packer')?.modes, undefined);
  assert.equal(getSidebarPageNav('scan-out')?.modes, undefined);
});

test('GlobalHeader always mounts Mode + Recents + Pins (Mode nulls itself when modeless)', () => {
  assert.match(HEADER, /HeaderModeSwitcher/);
  assert.match(HEADER, /HeaderRecentsSwitcher/);
  assert.match(HEADER, /HeaderPinsSwitcher/);
  assert.doesNotMatch(HEADER, /isReceivingHeaderModeRoute/);
});

test('HeaderModeSwitcher navigates via SIDEBAR_PAGE_NAV + useSidebarModeNav', () => {
  assert.match(MODE, /getSidebarPageNav/);
  assert.match(MODE, /useSidebarModeNav/);
  assert.match(MODE, /useActiveSidebarMode/);
  assert.match(MODE, /AnchoredLayer/);
});

test('HeaderRecentsSwitcher reuses useRecentModes + useSidebarModeNav', () => {
  assert.match(RECENTS, /useRecentModes/);
  assert.match(RECENTS, /useSidebarModeNav/);
  assert.match(RECENTS, /AnchoredLayer/);
});

test('HeaderPinsSwitcher owns Quick Access pins (not the avatar popover)', () => {
  assert.match(PINS, /useQuickAccess/);
  assert.match(PINS, /HEADER_CLUSTER_HAIRLINE/);
  assert.match(PINS, /MAX_HEADER_PIN_ICONS/);
  assert.match(PINS, /reorder/);
  assert.match(HEADER_SHELL, /HEADER_CLUSTER_HAIRLINE/);
  assert.doesNotMatch(QUICK_ACCESS_POPOVER, /PinnedSection/);
  assert.doesNotMatch(QUICK_ACCESS_POPOVER, /PinThisPageButton/);
});

test('MasterNavHeader has no MRU jump chips', () => {
  assert.doesNotMatch(MASTER_HEADER, /recentModes/);
  assert.doesNotMatch(MASTER_HEADER, /SIDEBAR_MRU/);
  assert.doesNotMatch(MASTER_NAV, /useRecentModes/);
  assert.doesNotMatch(MASTER_NAV, /recentModes/);
});

test('MasterNavHeader left-justifies name-of-now with body role beside glyph', () => {
  assert.doesNotMatch(MASTER_HEADER, /absolute inset-0.*justify-center|justify-center.*absolute inset-0/);
  assert.match(MASTER_HEADER, /flex min-w-0 flex-1 items-center/);
  assert.match(MASTER_HEADER, /data-master-nav-label/);
  // One step under title — beside h-4 glyph without overpowering it.
  // leading-tight (not leading-none): truncate's overflow:hidden clips descenders at lh=1.
  assert.match(MASTER_HEADER, /text-role-body font-semibold leading-tight/);
  assert.doesNotMatch(MASTER_HEADER, /data-master-nav-label[\s\S]*?leading-none/);
  assert.doesNotMatch(MASTER_HEADER, /data-master-nav-label[\s\S]*?text-role-(?:title|eyebrow)/);
});

test('MasterNavView shows page icon for modeless pages (mode glyph when modeful)', () => {
  // Modeful branch keeps active mode icon; modeless falls back to page.icon.
  assert.match(MASTER_VIEW, /modes\.length > 1/);
  assert.match(MASTER_VIEW, /activePage\.icon/);
  assert.match(MASTER_VIEW, /leadingIcon=\{headerIcon\}/);
});

test('MasterNavHeader is identity-only — no always-false nav-toggle API', () => {
  // Spine body IS the page list; a band chevron would be a dead control.
  // Column open lives on SidebarNavColumn, not MasterNavHeader.
  assert.doesNotMatch(MASTER_HEADER, /showNavToggle/);
  assert.doesNotMatch(MASTER_HEADER, /ChevronDown/);
  assert.doesNotMatch(MASTER_HEADER, /aria-expanded/);
  assert.doesNotMatch(MASTER_HEADER, /\bopen\b/);
  assert.doesNotMatch(MASTER_HEADER, /onClick/);
  assert.doesNotMatch(MASTER_VIEW, /showNavToggle/);
  assert.doesNotMatch(MASTER_VIEW, /onOpen/);
  assert.doesNotMatch(MASTER_NAV, /onOpenNav/);
});

test('GlobalHeader and MasterNav spine share TOP_CHROME_BAND face (one hairline Y)', () => {
  assert.match(HEADER_SHELL, /TOP_CHROME_BAND_FACE/);
  assert.match(HEADER_SHELL, /h-\[40px\].*border-b border-border-soft|border-b border-border-soft.*h-\[40px\]/);
  assert.match(HEADER, /TOP_CHROME_BAND_CLASS/);
  assert.match(MASTER_VIEW, /TOP_CHROME_BAND_FACE/);
  // Regression: outer border-b wrapping a separate 40px child → 41px step.
  assert.doesNotMatch(MASTER_VIEW, /border-b border-border-hairline/);
  assert.doesNotMatch(MASTER_HEADER, /h-\[40px\]/);
});

test('modeful sidebar panels do not mount an L2 mode rail twin', () => {
  for (const rel of PANEL_SOURCES) {
    const src = code(sourceOf(rel));
    assert.doesNotMatch(
      src,
      /aria-label="(Receiving|Shipping|Products|Tech sidebar|Pack|Inventory section|Sourcing|Warehouse section|Support|Operations) mode"/,
      `${rel} still mounts a page-L2 mode rail`,
    );
  }
});
