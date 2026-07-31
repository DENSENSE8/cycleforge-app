/**
 * Source guard: L2 Mode + Recents live in GlobalHeader for every modeful page.
 * Pins the XOR — header mounts Mode/Recents; sidebar panels must not remount a
 * page-L2 mode rail twin. Nested facet sliders are OK.
 *
 * SoT: SIDEBAR_PAGE_NAV + useSidebarModeNav · HeaderModeSwitcher · HeaderRecentsSwitcher
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
const HEADER_SHELL = code(sourceOf('./header-shell.ts'));
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
  assert.ok(getSidebarPageNav('receiving')?.modes?.some((m) => m.id === 'receive'));
  assert.ok(getSidebarPageNav('outbound')?.modes?.some((m) => m.id === 'labels'));
});

test('GlobalHeader always mounts Mode + Recents (Mode nulls itself when modeless)', () => {
  assert.match(HEADER, /HeaderModeSwitcher/);
  assert.match(HEADER, /HeaderRecentsSwitcher/);
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

test('MasterNavHeader has no MRU jump chips', () => {
  assert.doesNotMatch(MASTER_HEADER, /recentModes/);
  assert.doesNotMatch(MASTER_HEADER, /SIDEBAR_MRU/);
  assert.doesNotMatch(MASTER_NAV, /useRecentModes/);
  assert.doesNotMatch(MASTER_NAV, /recentModes/);
});

test('MasterNavHeader centers name-of-now label in the band', () => {
  assert.match(MASTER_HEADER, /absolute inset-0 flex min-w-0 items-center justify-center/);
  assert.match(MASTER_HEADER, /data-master-nav-label/);
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
