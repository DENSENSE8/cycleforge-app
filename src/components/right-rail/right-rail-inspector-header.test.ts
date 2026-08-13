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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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
  'src/components/photos/photo-inspector/PhotoInspectorPanel.tsx',
  // The n ≠ 1 face of the SAME Media Library slot — one chrome grammar at both
  // cardinalities, so a selection never changes what the top row is.
  'src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx',
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
    // Governance reset archived `.claude/rules/display/*`; the live contract is
    // the SoT module + AGENTS.md region table (RightRailHost / DeskRailChromeRow).
    const agents = read('AGENTS.md');
    const sot = read('src/components/right-rail/DeskRailChromeRow.tsx');
    assert.match(agents, /RightRailHost/);
    assert.match(agents, /usePanelStore/);
    assert.match(sot, /export function DeskRailChromeRow/);
    assert.match(sot, /closeAndCachePanel/);
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

  it('Incoming / Unfound / Bin / Support-context / Media Library compose DeskRailChromeRow', () => {
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

  /**
   * Surfaces still mounting a registrar ActionBar with a **defaulted** variant.
   * SHRINK-ONLY: pass `variant="flat"` to remove a line; nothing may add one.
   *
   * Each row states why it is still here, because flipping it is a visible
   * change to that surface and deserves its own look, not a drive-by.
   */
  const DEFAULTED_ACTION_BAR_VARIANT: Readonly<Record<string, string>> = {
    'src/components/station/ReceivingDetailsStack.tsx':
      'detail:receiving utility row. Flipping to flat re-paints the station stack’s ' +
      'contextual toolbar, so it wants an operator look rather than a sweep.',
  };

  it('a DEFAULTED ActionBar variant is card — the ban must not stop at the explicit string', () => {
    // The sibling test above matches `variant="card"` literally. `variant`
    // DEFAULTS to `'card'` (`pane-header/blocks.tsx`), so a call site that
    // simply omits it renders the banned pill and sails through — a
    // signature-precise ratchet manufacturing false green. Found while landing
    // 2e: the new FBA chrome omitted it and passed.
    const blocks = code(read('src/components/ui/pane-header/blocks.tsx'));
    assert.match(
      blocks,
      /variant = 'card'/,
      "this test assumes 'card' is the default — if the default changed, re-read the ban",
    );

    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      if (rel in DEFAULTED_ACTION_BAR_VARIANT) continue;
      const src = code(readFileSync(full, 'utf8'));
      if (!hasRegistrar(src)) continue;
      for (const m of src.matchAll(/<PaneHeaderActionBar\b([\s\S]{0,400}?)\/?>/g)) {
        if (/variant=/.test(m[1])) continue;
        if (!offenders.includes(rel)) offenders.push(rel);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'A registrar ActionBar must pass variant="flat" explicitly — the default is the banned card pill. ' +
        `Offenders: ${offenders.join(', ') || '(none)'}`,
    );
  });

  /**
   * Repo-wide hero-identity scan (2e) — replaces per-surface goldens.
   *
   * The law is `display/right-rail-inspector.md` → identity Hard Never: a rail
   * identity is an eyebrow + a short durable key, "never a **wrapping hero
   * title**", and never `text-role-title` / `text-role-display` / raw `text-lg`+.
   *
   * Three things this scan learned the hard way, all load-bearing:
   *
   *  1. **It follows ONE hop into local children.** `SkuDetailView` is the
   *     registrar and its hero title lived in `sku-detail/SkuDetailHeader.tsx` —
   *     a file-only scan reports green while the fork sits one import away.
   *
   *  2. **A hero MARKER is not a hero TITLE.** Scanning for bare `<h2>` or bare
   *     `text-lg` flags `<h2 className={sectionLabel}>` on the sync dialogs
   *     (an eyebrow) and `<div class="text-lg tabular-nums">` in BinDetailFlyout
   *     (a body stat). So the ban is hero density **on a heading element**, plus
   *     the identity-only roles anywhere.
   *
   *  3. **A surface whose CHROME is SoT-composed is skipped.** The ban is on a
   *     hero title in the CHROME, not in the body — `InventoryInspectorRail`
   *     composes `DeskRailChromeRow` + `PaneHeaderLabel` and then renders
   *     `ByUnitView`, a record-content SoT with its own body headings, and
   *     `SkuDetailHeader` keeps a legitimate `<h1>` on its full-PAGE branch.
   *     Skipping on composition (not on an allowlist) is what keeps this a
   *     universal scan instead of a golden list.
   */
  const HERO_IDENTITY_ROLE = /text-role-title|text-role-display|\bcardTitle\b/;
  const HERO_HEADING =
    /<h[12]\b[^>]*className=\{?[^>]*?(text-role-title|text-role-display|cardTitle|text-(?:lg|xl|2xl|3xl))\b/;
  const CHROME_SOT =
    /DeskRailChromeRow|PaneHeaderLabel|PaneHeaderActionBar|DeskInspectorIndexShell/;

  function resolveLocalImport(fromFile: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), spec);
    for (const candidate of [`${base}.tsx`, join(base, 'index.tsx')]) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  /** The registrar file plus the local modules it renders. */
  function surfaceFiles(registrar: string, src: string): string[] {
    const out = [registrar];
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = resolveLocalImport(registrar, m[1]);
      if (resolved) out.push(resolved);
    }
    return out;
  }

  it('no rail surface hand-rolls a hero-title identity (repo-wide)', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      if (full.endsWith('.test.tsx')) continue;
      const src = code(readFileSync(full, 'utf8'));
      if (!hasRegistrar(src)) continue;

      const files = surfaceFiles(full, src);
      const sources = files.map((f) => code(readFileSync(f, 'utf8')));
      // Chrome already resolves through the SoT ⇒ remaining headings are body.
      if (sources.some((s) => CHROME_SOT.test(s))) continue;

      files.forEach((f, i) => {
        const s = sources[i];
        if (!HERO_IDENTITY_ROLE.test(s) && !HERO_HEADING.test(s)) return;
        const rel = relative(ROOT, f).split('\\').join('/');
        const via = f === full ? '' : ` (via ${relative(ROOT, full).split('\\').join('/')})`;
        if (!offenders.includes(rel + via)) offenders.push(rel + via);
      });
    }
    assert.deepEqual(
      offenders,
      [],
      'A right-rail record inspector identity is an eyebrow + a short durable key — never a wrapping hero title. ' +
        `Compose DeskRailChromeRow + PaneHeaderLabel. Offenders: ${offenders.join(', ') || '(none)'}. ` +
        'Recipe: .claude/rules/display/right-rail-inspector.md',
    );
  });

  it('the three migrated rails compose the Desk chrome SoT', () => {
    // Pins the 2e migration so a revert is a failure, not a silent regression.
    const migrated: Array<[string, string[]]> = [
      ['src/features/my-day/MyDayTaskInspector.tsx', ['DeskRailChromeRow', 'PaneHeaderLabel']],
      ['src/components/fba/FbaBoardDetailPanel.tsx', ['DeskRailChromeRow', 'PaneHeaderLabel']],
      ['src/components/sku/sku-detail/SkuDetailHeader.tsx', ['DeskRailChromeRow', 'PaneHeaderLabel']],
    ];
    for (const [rel, needles] of migrated) {
      const src = code(read(rel));
      for (const needle of needles) {
        assert.ok(src.includes(needle), `${rel} must compose ${needle}`);
      }
    }

    // FBA's close used to route through PanelActionBar, which DROPS `onClose`
    // ("close lives on RightRailHost (backdrop / Esc)") — untrue since the
    // non-modal flip, so the panel shipped with no visible dismiss.
    const fba = code(read('src/components/fba/FbaBoardDetailPanel.tsx'));
    assert.equal(
      fba.includes('PanelActionBar'),
      false,
      'FbaBoardDetailPanel must not re-adopt PanelActionBar (it swallows onClose and pairs prev/next with contextual actions on one ActionBar)',
    );
  });

  it('DeskRailChromeRow SoT owns the optical one-row class', () => {
    const src = code(read('src/components/right-rail/DeskRailChromeRow.tsx'));
    assert.match(src, /DESK_RAIL_CHROME_ROW_CLASS/);
    assert.match(src, /pl-2/);
    assert.match(src, /data-right-rail-host-close-slot/);
    assert.doesNotMatch(src, /PaneHeaderCloseButton/);
    assert.match(src, /trailing/);
    assert.match(src, /flex h-8 shrink-0 items-center pl-2 pr-2/);
    assert.match(
      src,
      /z-header/,
      'chrome row must sit above the inset resize sash (z-sticky)',
    );
  });

  it('RightRailHost owns the singleton →| close (closeAndCachePanel)', () => {
    const host = code(read('src/components/right-rail/RightRailHost.tsx'));
    assert.match(host, /ArrowRightToLine/);
    assert.match(host, /closeAndCachePanel/);
    assert.match(host, /right-rail-host-close/);
    assert.match(host, /usePanelStoreKeyboard/);
    assert.doesNotMatch(
      host,
      /PaneHeaderCloseButton/,
      'host close is IconButton + ArrowRightToLine, not the pane-header twin',
    );
  });
});
