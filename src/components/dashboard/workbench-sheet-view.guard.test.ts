/**
 * `WorkbenchSheetView` — the three-band Sheets flush shell (2d / D1).
 *
 * **What changed, and why this guard exists.** The Sheets recipe used to be
 * enforced *by assertion*: each page guard checked that its own view file
 * contained `WORKBENCH_SHEET_CHROME`, `WORKBENCH_SHEET_HOST`, `WorkbenchKpiBand`
 * and the flush `rounded-none border-l-0 border-t-0` face. Five pages, five
 * copies of the recipe, five copies of the check — and any one of them could
 * drift in a way its own guard still passed (a copy is only ever compared to
 * itself). This is the briefing's core thesis: sameness by assertion, not by
 * construction.
 *
 * Now the shell owns the recipe and this guard asserts it **once**, plus that
 * every cohort page routes through it. A page can no longer diverge, because it
 * no longer holds the tokens to diverge with.
 *
 * The per-page guards keep their page-specific content (which tabs, which
 * trailing CTAs, which selection plane) — that is genuinely per-surface and is
 * not what was duplicated.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SHELL = 'src/components/dashboard/WorkbenchSheetView.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Strip comments so doc prose cannot satisfy — or trip — a token check. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Pages whose chrome IS the three-band Sheets stack, so they compose the shell.
 *
 * A row leaves this list only if that surface stops being a three-band sheet.
 * Adding a new lifecycle workbench adds a row — it does not add a sixth copy of
 * the recipe.
 */
const COHORT: readonly string[] = [
  // Scan stations + To-ship (the first pass).
  'src/components/tech/testing/TestingWorkspaceView.tsx',
  'src/components/tech/shipping/ShippingWorkspaceView.tsx',
  'src/components/packer/PackWorkspaceView.tsx',
  'src/components/receiving/triage/TriageWorkspaceView.tsx',
  'src/components/outbound/labels/LabelsWorkspaceView.tsx',
  'src/components/dashboard/DashboardOrdersView.tsx',
  // Every other three-band sheet (the all-pages pass).
  'src/components/fba/FbaOutboundWorkspace.tsx',
  'src/components/receiving/pickup/PickupWorkspace.tsx',
  'src/components/warehouse/LocationsWorkspace.tsx',
  'src/components/products/catalog/ProductsCatalogWorkspace.tsx',
  'src/components/support/zendesk/SupportTicketsBoard.tsx',
  'src/components/labels/LabelsProductsWorkspace.tsx',
  'src/components/inventory/UnitsWorkspaceView.tsx',
  'src/features/review/ReviewPackingTable.tsx',
  'src/features/review/pairing/ReviewPairingTable.tsx',
  'src/features/review/catalog-link/ReviewCatalogLinkTable.tsx',
];

/**
 * Sheet surfaces that deliberately do NOT compose the shell, each with the
 * reason — because "this page is different" is a claim, and a bare exclusion
 * list cannot be wrong out loud (`pattern-evolution.md` → Always #6).
 */
const OUT_OF_COHORT: Readonly<Record<string, string>> = {
  'src/components/receiving/unbox/UnboxWorkspaceView.tsx':
    'Unbox renders ONE band here — Bands 2 and 3 live INSIDE UnboxWorkspaceHeader ' +
    '(its KPI canvas + LEAN row are the header’s own, and its View cluster is on the ' +
    'inspector). There is no three-band stack in this file to lift.',
  'src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx':
    'A PAINT STAND-IN, not a workbench: it mirrors Unbox chrome as cheap geometry on ' +
    'the Tier-1 LCP path. Composing the shell would put a motion hook and a Suspense ' +
    'boundary in a loading fallback. It also mirrors Unbox, which is itself out.',
  'src/components/photos/PhotoLibraryPage.tsx':
    'A DOCUMENTED three-band INVERSION (display/media-library.md): Band 2 is search and ' +
    'Band 3 is the path strip — not tabs/KPI/triage — so the shell’s `kpi` and `triage` ' +
    'slots would misname what is in them. The surface is also ruled NO-MOTION, and the ' +
    'shell hooks a motion role.',

  // --- Band-1 chrome over a sheet host, but NO DashboardScrollShell. The shell
  // always renders one, so migrating would add a scroll port these do not have.
  'src/components/outbound/workspaces/ScanOutWorkspace.tsx':
    'Single-lane dock surface: no DashboardScrollShell, no KPI band, no Band 3 — the ' +
    'scan bar lives in the sidebar. The stack degenerates to Band-1 chrome over a sheet host.',
  'src/features/my-day/MyDayWorkspace.tsx':
    'Chrome is a plain sibling band with no DashboardScrollShell — the shell would add a ' +
    'scroll port this surface does not have.',
  'src/components/warranty/WarrantyClaimsTable.tsx':
    'Band-1 chrome over a sheet host with no DashboardScrollShell (a table component that ' +
    'renders its own band, mounted inside a page).',
  'src/components/tracking-exceptions/TrackingExceptionsTable.tsx':
    'Band-1 chrome over a sheet host with no DashboardScrollShell; still on a bespoke ' +
    'FilterBar rather than a Band-3 triage band.',
  'src/components/receiving/unfound/UnfoundQueueTable.tsx':
    'Band-1 chrome over a sheet host with no DashboardScrollShell (table component, not a page).',
  'src/components/repair/RepairTable.tsx':
    'Renders its own Band-1 chrome + triage over a sheet host but mounts no ' +
    'DashboardScrollShell. Pinned as `sheetShell: false` in workbench-cohort-wave7-sheet.guard.',
  'src/components/station/ReceivingLinesTable.tsx':
    'A grid BODY with its own triage band, mounted inside other hosts (Unbox / History / ' +
    'Incoming) — it is not a page and owns no scroll shell.',
  'src/components/outbound/orders/CsvImportStagingHost.tsx':
    'The CSV staging BODY that To-ship mounts INSIDE its own WorkbenchSheetView — a child ' +
    'of the shell, never a second one.',
  'src/components/support/service-workspace/SupportTicketFocus.tsx':
    'Workbench branch `service-workspace` (thread + composer), not a three-band sheet — ' +
    'display/workbench-service.md.',
  'src/components/walk-in/WalkInHistoryHub.tsx':
    'A hub of feed sections, not a tabs/KPI/triage sheet — no chrome stack to lift.',
};

describe('WorkbenchSheetView owns the Sheets flush recipe', () => {
  const shell = code(read(SHELL));

  it('owns the chrome stack, the sheet host and the flush Band-1 face', () => {
    assert.match(shell, /WORKBENCH_SHEET_CHROME/, 'shell owns the chrome host token');
    assert.match(shell, /WORKBENCH_SHEET_HOST/, 'shell owns the body host token');
    assert.match(
      shell,
      /flex flex-col gap-0/,
      'bands are static siblings in ONE stack — never independently sticky',
    );
    assert.match(
      shell,
      /const WORKBENCH_SHEET_TABS_CLASS = 'border-l-0 border-t-0 shadow-sm'/,
      'Band 1 flush face: GlobalHeader owns the top seam, the rail owns the left hairline',
    );
    // WorkbenchChromeHeader is flush at source (`cornerClass('flush')`), so a
    // call-site `rounded-none` is a redundant override — and
    // `dashboard-orders-sheet.guard` bans it by name. Five station pages each
    // carried one until the shell consolidated them.
    assert.equal(
      /WORKBENCH_SHEET_TABS_CLASS = '[^']*rounded-none/.test(shell),
      false,
      'the shared Band-1 face must not fight the flush header SoT with rounded-none',
    );
    assert.match(shell, /WorkbenchKpiBand/, 'shell owns Band 2 wiring');
    assert.match(shell, /DashboardScrollShell/);
  });

  it('never reintroduces the retired guttered-column recipe', () => {
    for (const banned of [
      'WORKBENCH_CHROME_COLUMN',
      'WORKBENCH_BODY_COLUMN',
      'WORKBENCH_GUTTERS',
      'WORKBENCH_TABLE_VIEWPORT',
    ]) {
      assert.equal(
        shell.includes(banned),
        false,
        `${banned} is the retired framed-gutter recipe — the sheet is flush`,
      );
    }
  });

  it('KPI Band 2 stays a binary snap — never a collapse tween', () => {
    // Ops chrome show/hide is instant (`AGENTS.md` → Ops chrome binary show/hide).
    // The shell holds the only KPI wiring now, so this is the one place to check.
    assert.match(shell, /onSnapCollapse/);
    assert.match(shell, /onSnapExpand/);
    assert.equal(
      shell.includes('collapseHeight'),
      false,
      'KPI band must snap — never collapseHeight / opacity / layout tween',
    );
  });

  it('the body swap is opt-in and uses the station-cadence focus role', () => {
    assert.match(shell, /motionRole\.swap\.focus/);
    assert.match(
      shell,
      /swapKey === undefined/,
      'a surface with no lifecycle tab must render its body without a crossfade',
    );
  });

  it('the chrome controller is injectable (To-ship takes its own from context)', () => {
    assert.match(shell, /export interface WorkbenchSheetChrome/);
    assert.match(shell, /export function useWorkbenchSheetChrome/);
    assert.match(
      shell,
      /chrome: WorkbenchSheetChrome/,
      'the controller is a required prop — a surface whose View cluster lives on the ' +
        'inspector (To-ship) supplies its own rather than forking the shell',
    );
  });

  it('every cohort page composes the shell and holds no recipe of its own', () => {
    for (const rel of COHORT) {
      const src = code(read(rel));
      assert.match(src, /<WorkbenchSheetView/, `${rel} must compose WorkbenchSheetView`);
      // The tokens now live in exactly one file. A page that still names them is
      // hand-rolling the stack beside the shell.
      for (const token of ['WORKBENCH_SHEET_CHROME', 'WORKBENCH_SHEET_HOST', 'WorkbenchKpiBand']) {
        assert.equal(
          src.includes(token),
          false,
          `${rel} must not name ${token} — WorkbenchSheetView owns the recipe`,
        );
      }
      assert.equal(
        /rounded-none border-l-0 border-t-0/.test(src),
        false,
        `${rel} must not re-type the flush Band-1 face — the shell passes it to the tabs slot`,
      );
    }
  });

  it('no page outside the shell hand-rolls the three-band chrome stack', () => {
    // The stack is `cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')`. Anything
    // spelling that outside the shell is a sixth copy of the recipe.
    const offenders: string[] = [];
    for (const rel of [...COHORT, ...Object.keys(OUT_OF_COHORT)]) {
      if (rel in OUT_OF_COHORT) continue;
      const src = code(read(rel));
      if (/WORKBENCH_SHEET_CHROME[\s\S]{0,40}flex flex-col gap-0/.test(src)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], `Compose WorkbenchSheetView. Offenders: ${offenders.join(', ')}`);
  });

  it('every out-of-cohort sheet surface states its reason', () => {
    for (const [rel, reason] of Object.entries(OUT_OF_COHORT)) {
      assert.ok(reason.length > 40, `${rel} needs a real reason, not a placeholder`);
      // The file must still exist — a stale exclusion is worse than none.
      assert.ok(read(rel).length > 0, `${rel} is listed out-of-cohort but does not exist`);
    }
  });

  it('EVERY sheet-chrome consumer is classified — cohort or stated divergence', () => {
    // The closing assertion. Without it, the next surface to grow a three-band
    // stack simply would not appear in either list, and the shell's reach would
    // quietly stop expanding — the same silent drift the shell exists to end.
    // A new sheet must join COHORT or state why it diverges.
    const OWNERS = new Set([
      'src/components/dashboard/workbench-shell.tsx', // defines the tokens
      'src/components/dashboard/WorkbenchSheetView.tsx', // the shell itself
    ]);
    const classified = new Set([...COHORT, ...Object.keys(OUT_OF_COHORT), ...OWNERS]);

    const consumers = execFileSync(
      'grep',
      ['-rl', 'WORKBENCH_SHEET_CHROME', join(ROOT, 'src'), '--include=*.tsx'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .map((abs) => relative(ROOT, abs).split('\\').join('/'))
      .filter((rel) => !rel.endsWith('.guard.test.ts') && !rel.endsWith('.test.tsx'));

    const unclassified = consumers.filter((rel) => !classified.has(rel));
    assert.deepEqual(
      unclassified,
      [],
      'Every WORKBENCH_SHEET_CHROME consumer must be in COHORT (composes the shell) or ' +
        `OUT_OF_COHORT (with a stated reason). Unclassified: ${unclassified.join(', ')}`,
    );
  });
});
