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
  'src/features/my-day/MyDayWorkspace.tsx',
  'src/features/review/catalog-link/ReviewCatalogLinkTable.tsx',
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
      /isEditableTarget/,
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
