/**
 * Right-rail record-inspector header contract.
 *
 * Pins laws from `source-of-truth.md` → Panel header grammar /
 * `display/right-rail-inspector.md`:
 *
 *  1. A file that both registers a `DetailStackRailRegistrar` and imports
 *     `SidebarIntakeFormShell` must be on the intake/create allowlist — record
 *     peeks compose PaneHeader / DeskRailChromeRow, never the intake hero-title shell.
 *  2. Review catalog-link rails must compose PaneHeader + PaneHeaderLabel and
 *     must not import the intake shell.
 *  3. Desk single-card chrome: one in-flow top row — never Unbox's
 *     `stationMoreDetailsPaneHostClass` absolute host inside a RightRailHost card,
 *     never `rightSlot={…PaneHeaderCloseButton}` (split cluster), never
 *     `variant="card"` ActionBar as the chrome pill. Golden: `DeskRailChromeRow`
 *     (Unbox-aligned) — desk `detail:order` composes it + Unbox Displays plate.
 *
 * Run: npx tsx --test src/components/right-rail/right-rail-inspector-header.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SRC = join(ROOT, 'src');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Create / import / prefs overlays that may keep SidebarIntakeFormShell. */
const INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST = new Set<string>([
  // Incoming Add / CSV left this list 2026-08-08 (flush inspector + classify
  // platform). Shrink-only: finishing a migration removes a line, nothing adds
  // one without a stated reason.
]);

/**
 * Station pane hosts may use `stationMoreDetailsPaneHostClass` — Unbox-family
 * two-region chrome via {@link StationScanPaneHost}. Desk RightRailHost cards
 * must not.
 */
const STATION_PANE_HOST_ALLOWLIST = new Set<string>([
  'src/components/station/workbench/StationScanPaneHost.tsx',
]);

/** Record peeks that must never re-adopt the intake hero-title shell. */
const RECORD_RAIL_MUST_USE_PANE_HEADER = [
  'src/features/review/catalog-link/CatalogLinkFormRail.tsx',
] as const;

/** Desk rails that must compose the Unbox-aligned one-row SoT. */
const DESK_RAIL_CHROME_ROW_GOLDEN = [
  'src/components/sidebar/receiving/incoming-details/IncomingDetailsHeader.tsx',
  'src/components/receiving/unfound/UnfoundQueueDetailsPanel.tsx',
  'src/components/warehouse/BinDetailFlyout.tsx',
  'src/components/support/context/SupportContextDetailPanel.tsx',
  'src/components/receiving/workspace/ZohoSplitPane.tsx',
  'src/components/receiving/history/HistoryCartonTriagePanel.tsx',
] as const;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
      continue;
    }
    if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function hasRegistrar(src: string): boolean {
  return src.includes('DetailStackRailRegistrar') || src.includes('useRegisterRightPanel');
}

/** Split-cluster: close parked in PaneHeader rightSlot (often while ActionBar sits below). */
function hasRightSlotClose(src: string): boolean {
  return /rightSlot=\{[\s\S]{0,400}?PaneHeaderCloseButton/.test(src);
}

describe('right-rail inspector header', () => {
  it('forbids SidebarIntakeFormShell on DetailStackRailRegistrar files outside the intake allowlist', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      const src = code(readFileSync(full, 'utf8'));
      if (!hasRegistrar(src) || !src.includes('SidebarIntakeFormShell')) continue;
      if (INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST.has(rel)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `Record rails must use PaneHeader / DeskRailChromeRow, not SidebarIntakeFormShell. Offenders: ${offenders.join(', ') || '(none)'}. ` +
        'If this is a create/import/prefs overlay, add it to INTAKE_SHELL_WITH_REGISTRAR_ALLOWLIST with a reason. ' +
        'Recipe: .claude/rules/display/right-rail-inspector.md',
    );
  });

  it('catalog-link / import-exception rails compose PaneHeader identity, not intake shell', () => {
    for (const rel of RECORD_RAIL_MUST_USE_PANE_HEADER) {
      const src = code(read(rel));
      assert.equal(
        src.includes('SidebarIntakeFormShell'),
        false,
        `${rel} must not import SidebarIntakeFormShell (intake hero-title chrome)`,
      );
      assert.ok(src.includes('PaneHeader'), `${rel} must compose PaneHeader`);
      assert.ok(src.includes('PaneHeaderLabel'), `${rel} must compose PaneHeaderLabel`);
      assert.ok(src.includes('PaneHeaderActionBar'), `${rel} must compose PaneHeaderActionBar`);
      assert.ok(
        src.includes('onClose={onClose}') || src.includes('PaneHeaderCloseButton'),
        `${rel} must dismiss via ActionBar onClose or PaneHeaderCloseButton`,
      );
      assert.equal(
        /title=\{[^}]*productTitle/.test(src),
        false,
        `${rel} must not put productTitle in a header title prop`,
      );
    }
  });

  it('display contract file exists and names Desk single-card chrome + intake-shell ban', () => {
    const doc = read('.claude/rules/display/right-rail-inspector.md');
    assert.match(doc, /SidebarIntakeFormShell/);
    assert.match(doc, /PaneHeaderLabel/);
    assert.match(doc, /wrapping hero title/i);
    assert.match(doc, /DeskRailChromeRow/);
    assert.match(doc, /stationMoreDetailsPaneHostClass/);
    assert.match(doc, /single-card|one in-flow/i);
    assert.match(
      doc,
      /DeskInspectorIndexShell|chrome → Displays topics → flush body|chrome → context → identity/,
    );
    assert.match(doc, /chrome ONLY/);
    assert.match(doc, /index→leaf|index → leaf/);
  });

  it('ShippedDetailsPanel composes DeskRailChromeRow + Unbox index→leaf shell', () => {
    const panel = code(read('src/components/shipped/ShippedDetailsPanel.tsx'));
    assert.match(
      panel,
      /DeskRailChromeRow/,
      'chrome Row 1 must compose DeskRailChromeRow (top-left →|)',
    );
    assert.match(panel, /DeskInspectorIndexShell/);
    assert.match(panel, /buildOrderInspectorLeaves/);
    assert.match(panel, /orderInspectorOrderUpdateActions/);
    assert.doesNotMatch(panel, /SectionTabsSlider/);
    assert.doesNotMatch(panel, /density=["']icon["']/);
    assert.doesNotMatch(panel, /RecordPaneHeader/);
    assert.doesNotMatch(panel, /WorkOrderAssignmentCard/);
  });

  it('Incoming / Unfound / Bin / Support-context compose DeskRailChromeRow', () => {
    for (const rel of DESK_RAIL_CHROME_ROW_GOLDEN) {
      const src = code(read(rel));
      assert.ok(
        src.includes('DeskRailChromeRow'),
        `${rel} must compose DeskRailChromeRow (Desk single-card chrome SoT)`,
      );
      assert.equal(
        src.includes('stationMoreDetailsPaneHostClass'),
        false,
        `${rel} must not use stationMoreDetailsPaneHostClass inside a Desk card`,
      );
      assert.equal(
        hasRightSlotClose(src),
        false,
        `${rel} must not put PaneHeaderCloseButton in rightSlot (split-cluster)`,
      );
    }
  });

  it('Incoming Sync trails ↑↓ (ring twin) via DeskRailChromeRow trailing', () => {
    const src = code(
      read('src/components/sidebar/receiving/incoming-details/IncomingDetailsHeader.tsx'),
    );
    assert.ok(src.includes('incoming-details-sync'), 'Sync control must remain');
    assert.ok(src.includes('prevTestId="incoming-details-prev"'));
    assert.ok(src.includes('nextTestId="incoming-details-next"'));
    const prevIdx = src.indexOf('incoming-details-prev');
    const nextIdx = src.indexOf('incoming-details-next');
    const syncIdx = src.indexOf('incoming-details-sync');
    assert.ok(
      prevIdx > 0 && nextIdx > prevIdx && syncIdx > nextIdx,
      'order must be ↑ · ↓ · ↻ (Sync most right)',
    );
    assert.equal(/px-6/.test(src), false, 'Incoming chrome must not use px-6 gutters');
  });

  it('Desk RightRailHost cards never mount stationMoreDetailsPaneHostClass', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      const src = code(readFileSync(full, 'utf8'));
      if (!src.includes('stationMoreDetailsPaneHostClass')) continue;
      if (STATION_PANE_HOST_ALLOWLIST.has(rel)) continue;
      // The SoT module itself may mention the class in a doc comment — strip
      // already removed comments; if the symbol remains only as a string in
      // DeskRailChromeRow docs it was stripped. Live import/use is the ban.
      if (rel === 'src/components/right-rail/DeskRailChromeRow.tsx') continue;
      if (rel.endsWith('.guard.test.ts') || rel.endsWith('.test.ts')) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `stationMoreDetailsPaneHostClass is Unbox pane-host only. Desk cards use DeskRailChromeRow. Offenders: ${offenders.join(', ') || '(none)'}`,
    );
  });

  it('DetailStackRailRegistrar files never split close into PaneHeader rightSlot', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      const src = code(readFileSync(full, 'utf8'));
      if (!hasRegistrar(src)) continue;
      if (!hasRightSlotClose(src)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `Close in PaneHeader rightSlot splits the chrome row. Use DeskRailChromeRow or PaneHeaderActionBar onClose. Offenders: ${offenders.join(', ') || '(none)'}`,
    );
  });

  it('DetailStackRailRegistrar files never use variant="card" ActionBar chrome pill', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      const src = code(readFileSync(full, 'utf8'));
      if (!hasRegistrar(src)) continue;
      if (!src.includes('PaneHeaderActionBar')) continue;
      if (!/variant=["']card["']/.test(src)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `variant="card" ActionBar is the deleted pill row. Use flat ActionBar or DeskRailChromeRow. Offenders: ${offenders.join(', ') || '(none)'}`,
    );
  });

  it('DeskRailChromeRow SoT owns the optical one-row class', () => {
    const src = code(read('src/components/right-rail/DeskRailChromeRow.tsx'));
    assert.match(src, /DESK_RAIL_CHROME_ROW_CLASS/);
    assert.match(src, /pl-2/);
    assert.match(src, /PaneHeaderCloseButton/);
    assert.match(src, /trailing/);
    assert.match(src, /flex h-8 shrink-0 items-center pl-2 pr-2/);
    assert.match(
      src,
      /z-header/,
      'chrome row must sit above the inset resize sash (z-sticky)',
    );
  });
});
