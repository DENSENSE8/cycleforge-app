/**
 * Source guard: **find-only Band 3** — codebase-wide, one walk.
 *
 * Every desk / ops-queue surface that mounts {@link WorkbenchTriageBand} above a
 * data table wears the Unbox History recipe:
 *
 *   1. Dominant find — `TechRailSearchBar` / `SearchField` at `min-w-0 flex-1`,
 *      never a compact `w-N shrink-0 lg:w-N` box beside an empty row.
 *   2. Refine rides IN the field (`trailingSuffix`, `density="field"`) or on the
 *      pushing inspector's View cluster. The right zone is view toggles only.
 *   3. Far-right `trailing` = **Show / Hide inspector** on every surface whose
 *      grid opens a `RightRailHost` peek — honest absence everywhere else.
 *   4. Desk copy is inspector copy. Station `Open displays` / `Hide right panel`
 *      belongs to `StationDisplaysEdgeToggle`, never to a Band 3.
 *   5. ONE inspector-toggle implementation. Both goldens hand-rolled it before
 *      2026-08-08; a third copy is the fork this file exists to prevent.
 *
 * This walks the disk rather than a hand-list, the same way
 * `grid-surface-capabilities.guard.test.ts` does — a hand-list stayed green
 * through two undeclared grid mounts, and it would stay green through the next
 * page-local Band 3 twin too.
 *
 * Both allowlists are **shrink-only**: finishing a migration removes a line.
 *
 * Run: node --test --import tsx \
 *        src/components/dashboard/band3-find-only.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const TOGGLE_MODULE = 'src/components/dashboard/workbench-inspector-toggle.tsx';

/**
 * Surfaces whose grid opens a desk `RightRailHost` peek, so Band 3 owns
 * Show / Hide inspector. Adding a peek to a surface adds a row here.
 */
const INSPECTOR_TOGGLE_SURFACES: readonly string[] = [
  'src/components/dashboard/OutboundWorkspaceHeader.tsx',
  'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx',
  'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
  'src/components/repair/RepairWorkspaceHeader.tsx',
  'src/components/fba/FbaWorkspaceHeader.tsx',
  'src/components/warehouse/LocationsWorkspace.tsx',
  'src/components/photos/PhotoLibraryWorkspaceHeader.tsx',
  // Home → Daily (new 2026-08-19): it mounts `WorkbenchInspectorToggle` at
  // its Band 3 trailing edge, so it belongs on THIS list by observation,
  // not by intent — classified from what the file does.
  'src/features/home/HomeDailyMode.tsx',
];

/**
 * Honest absence — a Band 3 with no desk peek behind it. Station benches open
 * `LineEditPanel` / the Displays push column instead; catalog + pickup rows
 * navigate. **Never mount the toggle here to make a band look symmetrical.**
 * A row leaves this list only when that surface genuinely grows a peek.
 *
 * Each row states WHY, because "no peek" is a claim about a surface, and a bare
 * string list cannot be wrong out loud. The reason is what the next agent reads
 * before deciding the empty right edge is a bug (`pattern-evolution.md` →
 * Always #6: a guard names the surviving call sites, with their reason).
 */
const NO_DESK_PEEK_SURFACES: Readonly<Record<string, string>> = {
  'src/features/my-day/MyDayWorkspace.tsx':
    'Its grid was deleted on 2026-08-20 while the display is rewritten, so there is no Band 3 and no peek to expose — the file is a TableRebuildPlaceholder. This is a rebuild TODO, not a ruling: the row moves back to INSPECTOR_TOGGLE_SURFACES when the sheet returns with its desk peek.',
  'src/features/review/catalog-link/ReviewCatalogLinkTable.tsx':
    'Its grid was deleted on 2026-08-20 while the display is rewritten, so there is no Band 3 and no peek to expose — the file is a TableRebuildPlaceholder. This is a rebuild TODO, not a ruling: the row moves back to INSPECTOR_TOGGLE_SURFACES when the sheet returns with its desk peek.',
  'src/components/outbound/orders/CsvImportStagingHost.tsx':
    'Its grid was deleted on 2026-08-20 while the display is rewritten, so there is no Band 3 and no peek to expose — the file is a TableRebuildPlaceholder. This is a rebuild TODO, not a ruling: the row moves back to INSPECTOR_TOGGLE_SURFACES when the sheet returns with its desk peek.',
  // Ruled 2026-08-08 — the return-queue "Show inspector" ask. Rows claim the
  // bench (`dispatchSelectLine` → `TestingPanel` covers this browse), so Band 3
  // is off screen the moment one opens; the only reusable peek
  // (`HistoryCartonTriagePanel`) is welded to Unbox History's sheet View
  // cluster. Full reasoning: TestingWorkspaceHeader.tsx docblock.
  'src/components/tech/testing/TestingWorkspaceHeader.tsx':
    'scan bench — rows open TestingPanel over this browse, no desk peek exists',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx':
    'scan bench — rows open the shipping station panel',
  'src/components/packer/PackWorkspaceHeader.tsx':
    'scan bench — rows open the pack station panel',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx':
    'scan bench — rows open the labels station column',
  'src/components/receiving/triage/TriageWorkspaceHeader.tsx':
    'scan bench (Arrival) — rows open the station centre door flow',
  'src/components/labels/LabelsProductsWorkspaceHeader.tsx':
    'print workspace — rows drive the label queue, not a record peek',
  'src/components/products/catalog/ProductsCatalogWorkspace.tsx':
    'catalog browse — rows navigate to the SKU page',
  'src/components/receiving/pickup/PickupWorkspace.tsx':
    'pickup browse — rows navigate to the order',
  'src/components/support/zendesk/SupportTicketsBoard.tsx':
    'service-workspace — a ticket opens the thread in the MIDDLE, not a rail peek',
  'src/features/review/ReviewPackingTable.tsx':
    'review workspace — rows open the packing QA body',
  'src/features/review/pairing/ReviewPairingTable.tsx':
    'review workspace — rows open the pairing body',
  'src/components/tracking-exceptions/TrackingExceptionsTable.tsx':
    'ops triage — rows open an edit dialog, not a RightRailHost desk peek',
  'src/components/repair/ProductSelector.tsx':
    'kiosk catalog find reuses To-ship / Unbox Band 3 (TechRailSearchBar in WorkbenchTriageBand); the counter has no RightRailHost peek — the cart ledger is the session root, so the inspector toggle is honest absence',
};

/**
 * Surfaces whose row-narrowing facet legitimately stays in the Band 3 `right`
 * zone instead of riding in the find field. Both are the SAME documented
 * carve-out: their History tab has **no find field at all** (honest absence),
 * so the staff facet has no `trailingSuffix` slot to move into, and inventing a
 * find bar to host one would be worse.
 *
 * Shrink-only. Anything else narrowing rows belongs in `trailingSuffix`.
 */
const RIGHT_ZONE_FACET_RESIDENTS: readonly string[] = [
  'src/components/packer/PackWorkspaceHeader.tsx',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (abs.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Files that MOUNT the band (not the module that defines it, not guards). */
const bandMounts: Array<{ rel: string; body: string }> = walk(SRC)
  .map((abs) => ({ rel: relative(ROOT, abs), body: code(readFileSync(abs, 'utf8')) }))
  .filter(({ body }) => body.includes('<WorkbenchTriageBand'));

describe('Band 3 is find-only', () => {
  it('finds every band mount on disk', () => {
    assert.ok(
      bandMounts.length >= 15,
      `expected the Band-3 cohort, found ${bandMounts.length} mounts`,
    );
  });

  it('the find bar carries the whole row — no compact width box', () => {
    for (const { rel, body } of bandMounts) {
      assert.doesNotMatch(
        body,
        /className="[^"]*\bw-\d+ shrink-0\b[^"]*"/,
        `${rel}: Band 3 find must be min-w-0 flex-1, not a compact shrink-0 box`,
      );
      assert.doesNotMatch(
        body,
        /className="[^"]*\blg:w-(?:56|64)\b[^"]*"/,
        `${rel}: Band 3 find must not pin a breakpoint width`,
      );
    }
  });

  it('every chrome find bar is min-w-0 flex-1', () => {
    // Counted, not sliced: a bar carrying an in-field `trailingSuffix` nests its
    // own JSX, so a non-greedy `<TechRailSearchBar …/>` slice stops at the first
    // inner `/>` and misses the className that is plainly there. Counting is
    // coarser and cannot report a false pass in the direction that matters — a
    // band with N chrome bars must supply at least N dominant-find classes.
    for (const { rel, body } of bandMounts) {
      const bars = (body.match(/variant="chrome"/g) ?? []).length;
      if (bars === 0) continue;
      const dominant = (body.match(/min-w-0 flex-1/g) ?? []).length;
      assert.ok(
        dominant >= bars,
        `${rel}: ${bars} chrome find bar(s) but only ${dominant} "min-w-0 flex-1" — Band 3 find carries the row`,
      );
    }
  });

  it('desk Band 3 never wears Station Displays copy', () => {
    for (const { rel, body } of bandMounts) {
      assert.doesNotMatch(
        body,
        /Open displays|Hide right panel/,
        `${rel}: Band 3 is an inspector, not Station Displays — say Show / Hide inspector`,
      );
    }
  });

  it('refine rides IN the find field, not the right zone', () => {
    // A facet that narrows the ROWS belongs in `trailingSuffix` beside the
    // query it refines; the right zone is view toggles only. `StaffFilterButton`
    // is the one facet on enough surfaces to drift, so it is the one pinned:
    // `density="field"` everywhere but the two documented residents.
    for (const { rel, body } of bandMounts) {
      if (!body.includes('<StaffFilterButton')) continue;
      if (RIGHT_ZONE_FACET_RESIDENTS.includes(rel)) continue;
      const mounts = (body.match(/<StaffFilterButton/g) ?? []).length;
      const inField = (body.match(/density="field"/g) ?? []).length;
      assert.ok(
        inField >= mounts,
        `${rel}: ${mounts} staff facet(s) but only ${inField} density="field" — refine rides in the find field`,
      );
    }
  });

  it('the faceted refine funnel has ONE implementation (2f)', () => {
    // `UnboxWorkspaceHeader` grew the same ~30-line `role="tablist"` twice
    // (History refine + triage refine): identical tab classes, identical
    // `onMouseDown` preventDefault (which keeps the popover open — drop it and
    // the funnel shuts on the first facet click), identical hot dot. Two copies
    // of one a11y-bearing control is two places for `aria-selected` or the
    // keep-open behavior to drift.
    //
    // Scoped to the FACETED funnel. `HistoryWorkspaceHeader`'s refine is a flat
    // grouped-row menu — every group at once, no tabbing — a different shape,
    // deliberately not folded in.
    const SOT = 'src/components/dashboard/workbench-filter-popover.tsx';
    const sot = code(readFileSync(join(ROOT, SOT), 'utf8'));
    assert.match(sot, /export function WorkbenchRefineFacetTabs/, `${SOT} owns the funnel tabs`);
    assert.match(sot, /WORKBENCH_REFINE_BODY_CLASS/, `${SOT} owns the facet body scroll port`);
    assert.match(
      sot,
      /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/,
      'the keep-open preventDefault must live in the SoT',
    );

    const offenders: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = relative(ROOT, abs);
      if (rel === SOT || rel.endsWith('.guard.test.ts')) continue;
      const body = code(readFileSync(abs, 'utf8'));
      // A hand-rolled facet tablist: a tablist carrying the funnel's own tab face.
      if (!body.includes('role="tablist"')) continue;
      if (!/border-b-2[^'"`]*px-1\.5 py-1\.5 text-role-caption/.test(body)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `Compose WorkbenchRefineFacetTabs — do not hand-roll a second refine funnel. Offenders: ${offenders.join(', ') || '(none)'}`,
    );

    // Both Unbox funnels actually route through it (a revert is a failure).
    const unbox = code(
      readFileSync(join(ROOT, 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx'), 'utf8'),
    );
    assert.equal(
      (unbox.match(/<WorkbenchRefineFacetTabs/g) ?? []).length,
      2,
      'both Unbox refine funnels (History + triage) compose the shared tabs',
    );
  });

  it('Unbox is the LEAN row — find + KPI + inspector, nothing else', () => {
    // Ruled 2026-08-08. Compare panes, spreadsheet zoom, ▦ column display and
    // the week pill left this row for the inspector View cluster, so the row
    // carries no `right` slot and no controls portal.
    //
    // The two halves are pinned TOGETHER on purpose: deleting `right=` while
    // the toggle stayed gated to History would strand an operator in
    // `?clayout=split` with no UI path back to one pane, because the View
    // cluster is now the only host for the layout menu.
    const rel = 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx';
    const unbox = bandMounts.find((m) => m.rel === rel);
    assert.ok(unbox, `${rel}: Unbox must still mount the SoT WorkbenchTriageBand`);
    const idx = unbox.body.indexOf('<WorkbenchTriageBand');
    const band = unbox.body.slice(idx, idx + 900);

    assert.doesNotMatch(band, /\bright=\{/, 'Unbox Band 3 has no right zone');
    assert.doesNotMatch(
      band,
      /controlsSlot(Ref|Props|ClassName)/,
      'Unbox Band 3 hosts no controls portal — ▦ lives on the inspector View cluster',
    );
    assert.match(band, /kpiToggle=\{/, 'KPI collapse is the row, not the View cluster');
    assert.match(band, /trailing=\{/, 'the inspector toggle closes the row');
    assert.doesNotMatch(
      unbox.body,
      /enabled=\{isHistoryTab\}/,
      'the inspector toggle is live on every sheet tab — it is the only door to compare / zoom / ▦',
    );
  });

  it('filtering is a nav TARGET, never a second global chord', () => {
    // Ruled 2026-08-08. ⌘; → m → f focuses find, r opens Refine. A band that
    // bound its own ⌘F (or a bare `/`, which a wedge types inside a printed
    // Digital Link) would be a second claimant on a chord registry that allows
    // exactly one owner each.
    for (const { rel, body } of bandMounts) {
      assert.doesNotMatch(
        body,
        /key === 'f'|code === 'KeyF'/,
        `${rel}: no page-local ⌘F — compose useNavRegion (the ⌘; leader)`,
      );
      assert.doesNotMatch(
        body,
        /key === '\/'|code === 'Slash'/,
        `${rel}: bare / is wedge-unsafe — a printed Digital Link types it mid-scan`,
      );
    }
  });

  it('Views renders in the RIGHT control cluster, before the KPI toggle', () => {
    // Ruled 2026-08-10. `views` used to sit inside the left flex-1 group,
    // flush-abutting the find field, which read as chrome belonging to the
    // query. It is a page-scoped CONTROL, so it belongs with its peers: the row
    // is `search · Views · KPI · inspector` and the right three are one cluster.
    //
    // The anchor is the RIGHT CLUSTER'S OWN opening tag, not the row's
    // `justify-between` — that class sits on the parent, so it precedes both
    // clusters and the broken layout satisfied it just as well. A guard whose
    // anchor cannot tell the two positions apart is the "pins the mechanism,
    // blesses the defect" shape (pattern-evolution.md → Always #6).
    const band = code(readFileSync(join(SRC, 'components/dashboard/workbench-shell.tsx'), 'utf8'));
    const RIGHT_CLUSTER = 'items-center gap-2 self-center';
    const rightCluster = band.indexOf(RIGHT_CLUSTER);
    const views = band.indexOf('{views}');
    const kpi = band.indexOf('{kpiToggle}');
    const trailing = band.indexOf('{trailing}');

    assert.ok(
      rightCluster > 0,
      `WorkbenchTriageBand must keep the right control cluster ("${RIGHT_CLUSTER}") — this guard reads position from it`,
    );
    assert.ok(views > 0, 'WorkbenchTriageBand must render the {views} slot');
    assert.ok(
      views > rightCluster,
      'Views belongs to the RIGHT cluster — never back inside the find group',
    );
    assert.ok(views < kpi, 'row order is search · Views · KPI · inspector');
    assert.ok(kpi < trailing, 'the inspector toggle closes the row');

    // Find owns the whole left: the search group holds no second slot.
    const left = band.slice(band.indexOf('{search}'), rightCluster);
    assert.doesNotMatch(
      left,
      /\{views\}/,
      'the left group is find and nothing else — Views is not part of the query',
    );

    // The old wrapper is what made it read as part of find. Its return is the
    // regression, even if {views} keeps its index.
    assert.doesNotMatch(
      band,
      /items-stretch self-stretch">\{views\}/,
      'no flush-abut wrapper — Views sits in the gap-2 cluster with its peers',
    );
  });

  it('no hand-rolled <select> chrome on a Band 3', () => {
    // A native `<select>` in the band is two violations at once: a second
    // filter grammar beside `WorkbenchFilterPopover`, and soft radius on ops
    // chrome (`cornerClass('flush')`). Locations shipped one in `right` until
    // 2026-08-08.
    for (const { rel, body } of bandMounts) {
      assert.doesNotMatch(
        body,
        /<select[\s>]/,
        `${rel}: compose WorkbenchFilterPopover density="field" — no raw <select> in Band 3 chrome`,
      );
    }
  });
});

describe('Show / Hide inspector has one implementation', () => {
  const toggle = readFileSync(join(ROOT, TOGGLE_MODULE), 'utf8');

  it('owns the copy, the glyph and the collapse SoT', () => {
    assert.match(toggle, /'Show inspector'/);
    assert.match(toggle, /'Hide inspector'/);
    assert.match(toggle, /ColumnsTwo/);
    assert.match(toggle, /toggleDetailInspectorCollapsed/);
    // Never ⌘] — Station Displays owns that chord (displays-toggle-hotkey.ts).
    assert.doesNotMatch(toggle, /key === '\]'\s*&&\s*\(e\.metaKey/);
    assert.match(
      toggle,
      /isEditableKeyTarget/,
      'the bare `]` chord must stand down inside the find field it sits beside',
    );
  });

  it('no surface hand-rolls a second one', () => {
    for (const { rel, body } of bandMounts) {
      if (rel === TOGGLE_MODULE) continue;
      const handRolled = body.includes('ColumnsTwo') && /Show inspector/.test(body);
      assert.equal(
        handRolled,
        false,
        `${rel}: compose WorkbenchInspectorToggle — do not re-declare the control`,
      );
    }
  });

  it('every desk-peek surface mounts it, and only those', () => {
    const mounted = new Set(
      bandMounts
        .filter(({ body }) => body.includes('<WorkbenchInspectorToggle'))
        .map(({ rel }) => rel),
    );
    for (const rel of INSPECTOR_TOGGLE_SURFACES) {
      assert.ok(mounted.has(rel), `${rel}: desk peek surface must expose Show / Hide inspector`);
    }
    for (const rel of Object.keys(NO_DESK_PEEK_SURFACES)) {
      assert.equal(
        mounted.has(rel),
        false,
        `${rel}: no desk peek behind this band — honest absence, not a dead toggle`,
      );
    }
  });

  it('every honest absence states its reason', () => {
    for (const [rel, reason] of Object.entries(NO_DESK_PEEK_SURFACES)) {
      assert.ok(
        reason.trim().length >= 20,
        `${rel}: say WHY this band has no peek — the next agent reads it before calling the empty right edge a bug`,
      );
    }
  });

  it('the two lists cover every band mount (no unclassified surface)', () => {
    const classified = new Set([
      ...INSPECTOR_TOGGLE_SURFACES,
      ...Object.keys(NO_DESK_PEEK_SURFACES),
    ]);
    const unclassified = bandMounts
      .map(({ rel }) => rel)
      .filter((rel) => rel !== TOGGLE_MODULE && !classified.has(rel));
    assert.deepEqual(
      unclassified,
      [],
      'a new Band 3 must declare whether its grid opens a desk peek',
    );
  });
});
