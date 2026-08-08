/**
 * WorkbenchTrailingCluster — Sort → Import → Add skeleton, and the ban on
 * chrome-altitude column Fields.
 *
 * Fields left the page chrome on 2026-08-02. The operator entry for column
 * visibility / display is `GridColumnGutter` — owns open state + mounts
 * `GridColumnDetailsPanel`. Rationale: Fields mutates the column set of the
 * card it sits on, so a page-chrome control acting on that card is an altitude
 * mismatch — and seven surfaces shipped BOTH doors onto the same rail id.
 *
 * **Band-3 portal is the norm (2026-08-06):** every table with a
 * `WorkbenchTriageBand` passes its controls slot as `columnTriggerPortalTarget`
 * so ▦ sits resident beside filter / staff / week / sort. Card-corner
 * hover-reveal (opacity-0 until hover/focus-within) is the fallback for tables
 * with no Band-3 — it reserves neither a `w-9` header track nor a page gutter.
 * A permanent lip on the trailing column covered `TRACKING`; that is the bug
 * the fallback still prevents.
 *
 * This does not relax the sticky-docking law: the banned shape is a Sheets-like
 * `TableActionBar` ABOVE the grid, which would add a second sticky layer to the
 * scroll port. That ban is asserted below and is unchanged.
 *
 * @see .claude/rules/display/workbench-ops-queue.md → Trailing Display & Actions
 * @see docs/todo/fields-to-notion-header-hover-HANDOFF.md
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { INCOMING_TABLE_DEFINITION } from '@/components/station/incoming-grid/incoming-table-definition';
import { RECEIVING_BROWSE_DEFINITION } from '@/components/station/receiving-grid/receiving-table-definition';

const ROOT = process.cwd();
const SHELL = join(ROOT, 'src/components/dashboard/workbench-shell.tsx');
/** The one column-display affordance both header families compose. */
const TRIGGER = 'src/design-system/components/grid/GridColumnDetailsTrigger.tsx';
const GRID_HEADERS = [
  'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
  'src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx',
] as const;

/**
 * Surfaces that must compose WorkbenchTrailingCluster for sort/actions
 * (honest absence OK — several now render nothing there and pass no `trailing`).
 */
const TRAILING_CLUSTER_ADOPTERS = [
  'src/components/packer/PackWorkspaceHeader.tsx',
  // Testing: Sheets three-band — sort lives on TestingTriageBand (icon), like
  // To-ship OutboundTriageBand; Band 1 has no trailing cluster (honest absence).
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx',
  'src/components/support/zendesk/SupportTicketsBoard.tsx',
  'src/components/photos/PhotoLibraryWorkspaceHeader.tsx',
  'src/components/receiving/pickup/PickupWorkspace.tsx',
  'src/components/repair/RepairWorkspaceHeader.tsx',
] as const;

/**
 * Every grid that declares `fieldsMenu: true` must expose the column-display
 * control, or its staff lose column display entirely. Header adapter → the view
 * that reaches it.
 *
 * The view no longer *owns* the rail. Since the Phase A plumbing collapse
 * (2026-08-02) a view reaches column display by mounting `LedgerGridSurface`,
 * which mounts `GridColumnGutter` by construction; the gutter owns the open
 * state and the rail. So the reachability half of this pairing is unchanged and
 * the ownership half INVERTED — a view that still mounts its own
 * `<GridColumnDetailsPanel>` is re-opening the second door this file exists to
 * keep shut. Who owns what is asserted once against the DS modules in
 * `grid-view-plumbing.guard.test.ts`, rather than thirteen times here.
 */
const COLUMN_DISPLAY_SURFACES: readonly (readonly [header: string, view: string])[] = [
  [
    'src/components/station/receiving-grid/ReceivingGridColumnHeader.tsx',
    'src/components/station/receiving-grid/ReceivingGridView.tsx',
  ],
  [
    'src/components/station/incoming-grid/IncomingGridColumnHeader.tsx',
    'src/components/station/incoming-grid/IncomingGridView.tsx',
  ],
  [
    'src/components/receiving/pickup/grid/PickupGridColumnHeader.tsx',
    'src/components/receiving/pickup/grid/PickupGridView.tsx',
  ],
  [
    'src/components/products/catalog/catalog-grid/CatalogGridColumnHeader.tsx',
    'src/components/products/catalog/catalog-grid/CatalogGridView.tsx',
  ],
  [
    'src/components/repair/repair-grid/RepairGridColumnHeader.tsx',
    'src/components/repair/repair-grid/RepairGridView.tsx',
  ],
  [
    'src/components/outbound/ready/grid/ReadyGridColumnHeader.tsx',
    'src/components/outbound/ready/grid/ReadyGridView.tsx',
  ],
  [
    'src/components/warranty/grid/WarrantyGridColumnHeader.tsx',
    'src/components/warranty/grid/WarrantyGridView.tsx',
  ],
  [
    'src/components/receiving/unfound/grid/UnfoundGridColumnHeader.tsx',
    'src/components/receiving/unfound/grid/UnfoundGridView.tsx',
  ],
  [
    'src/components/warehouse/bins-grid/BinsGridColumnHeader.tsx',
    'src/components/warehouse/bins-grid/BinsGridView.tsx',
  ],
  [
    'src/components/tracking-exceptions/grid/TrackingExceptionsGridColumnHeader.tsx',
    'src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx',
  ],
  [
    'src/features/review/catalog-link/grid/CatalogLinkGridColumnHeader.tsx',
    'src/features/review/catalog-link/grid/ReviewCatalogLinkGridView.tsx',
  ],
  // The two that chrome Fields used to serve exclusively.
  [
    'src/features/my-day/grid/MyDayGridColumnHeader.tsx',
    'src/features/my-day/grid/MyDayGridView.tsx',
  ],
  [
    'src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx',
    'src/components/dashboard/orders-queue/OrdersGridView.tsx',
  ],
];

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('WorkbenchTrailingCluster SoT', () => {
  const shell = readFileSync(SHELL, 'utf8');

  it('exports WorkbenchTrailingCluster with Sort → actions slot order', () => {
    assert.match(shell, /export function WorkbenchTrailingCluster/);
    assert.match(shell, /before\?: ReactNode/);
    assert.match(shell, /sort\?: ReactNode/);
    assert.match(shell, /actions\?: ReactNode/);
    assert.match(shell, /after\?: ReactNode/);
    const body = shell.slice(shell.indexOf('export function WorkbenchTrailingCluster'));
    const beforeIdx = body.indexOf('{before}');
    const sortIdx = body.indexOf('{sort}');
    const actionsIdx = body.indexOf('{actions}');
    const afterIdx = body.indexOf('{after}');
    assert.ok(beforeIdx > 0 && sortIdx > beforeIdx);
    assert.ok(actionsIdx > sortIdx);
    assert.ok(afterIdx > actionsIdx);
  });

  it('exports workbench chrome pill class as flush-square (zero-radius law)', () => {
    assert.match(shell, /export const WORKBENCH_CHROME_PILL_CLASS/);
    assert.match(shell, /WORKBENCH_CHROME_PILL_CLASS = cornerClass\('flush'\)/);
    // The soft-concentric pill is retired debt — it must not come back.
    assert.doesNotMatch(shell, /WORKBENCH_CHROME_PILL_CLASS = nestedCornerClass/);
    assert.doesNotMatch(shell, /WORKBENCH_TRAILING_HAIRLINE_JOIN_/);
    assert.doesNotMatch(shell, /rounded-l-none rounded-r-full/);
  });

  it('has NO fields slot — chrome Fields cannot grow back', () => {
    const props = shell.slice(
      shell.indexOf('interface WorkbenchTrailingClusterProps'),
      shell.indexOf('export function WorkbenchTrailingCluster'),
    );
    assert.doesNotMatch(props, /^\s*fields\?: ReactNode/m);
  });

  for (const rel of TRAILING_CLUSTER_ADOPTERS) {
    it(`${rel} composes WorkbenchTrailingCluster (no raw sort beside search)`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      assert.match(src, /WorkbenchTrailingCluster/);
      // Display sort must not live in the `right` filter cluster
      const rightBlock = src.match(/right=\{[\s\S]*?\n\s*(trailing|controlsSlot|className)/);
      if (rightBlock) {
        assert.doesNotMatch(rightBlock[0], /QueueSortSwitch/);
        assert.doesNotMatch(rightBlock[0], /PhotoSortMenu/);
        assert.doesNotMatch(rightBlock[0], /ZendeskSelect/);
        assert.doesNotMatch(rightBlock[0], /SortToggle/);
      }
    });
  }

  for (const [header, view] of COLUMN_DISPLAY_SURFACES) {
    it(`${view} reaches column display through the card's gutter`, () => {
      const headerSrc = readFileSync(join(ROOT, header), 'utf8');
      const viewSrc = readFileSync(join(ROOT, view), 'utf8');
      // A family either composes the factory — which forwards the resize grip by
      // construction, which is the whole reason it exists — or, if it is a
      // bespoke header (Orders), plumbs it itself.
      assert.ok(
        /makeLedgerGridColumnHeader/.test(headerSrc) || /onResizeColumn/.test(headerSrc),
        `${header} must compose makeLedgerGridColumnHeader or plumb onResizeColumn itself`,
      );
      // The door is the control over the card's own corner, never one in the
      // header band. A view reaches it by mounting the surface (which mounts the
      // gutter by construction), via NonlinearTableHost (which mounts the
      // surface), or, if it is bespoke, by composing the gutter.
      assert.match(
        viewSrc,
        /<LedgerGridSurface[<\s]|<NonlinearTableHost[<\s]|<GridColumnGutter[\s>]/,
        `${view} must reach column display — via LedgerGridSurface / NonlinearTableHost ` +
          `(which mounts GridColumnGutter), or by composing GridColumnGutter itself if bespoke`,
      );
      assert.doesNotMatch(
        viewSrc,
        /onOpenColumnDetails=\{/,
        `${view} must not pass onOpenColumnDetails to its header — the gutter owns it`,
      );
      // INVERTED 2026-08-02 (was: "must mount the column-display rail"). The rail
      // is mounted once, by the gutter. A view mounting its own is the second
      // door — the same shape as chrome Fields, which had to be retired because
      // seven surfaces opened `detail:grid-column-details` twice over.
      assert.doesNotMatch(
        viewSrc,
        /<GridColumnDetailsPanel/,
        `${view} must not mount the rail itself — GridColumnGutter owns it`,
      );
    });
  }

  it('▦ is portal-or-nothing — the card-corner float stays deleted', () => {
    const src = readFileSync(join(ROOT, TRIGGER), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /export function GridColumnGutter/);

    // THE invariant. Two hosts (Band-3 controls slot · inspector View cluster);
    // no host paints nothing. Deleted 2026-08-08 because the float overlapped
    // the first column header, and an operator who does not know the control
    // exists cannot hover a corner to discover it.
    assert.match(
      code,
      /triggerPortalTarget\s*\?\s*createPortal/,
      'paint is portal-or-nothing — no fallback branch',
    );

    // The corner cannot get a third life. Each of these IS the float.
    for (const [pattern, what] of [
      [/absolute right-1\.5 top-1\.5/, 'the card-corner float box'],
      [/group-hover\/grid-card/, 'the pointer hover-reveal'],
      [/group-focus-within\/grid-card/, 'the focus hover-reveal'],
      [/triggerPortalOnly/, 'the opt-out prop (nothing left to opt out of)'],
    ] as const) {
      assert.doesNotMatch(code, pattern, `${what} is deleted — do not reintroduce it`);
    }

    assert.doesNotMatch(code, /\bgap-2\b/, 'a reserved gutter is the shape this replaced');
    // CSS only — a framer whileHover on a grid card binds a re-render to mousemove.
    assert.doesNotMatch(code, /whileHover/, 'never a framer hover on a grid card');

    // The surface mounts the card INSIDE the wrapper, and no longer forwards an
    // opt-out it cannot honour.
    const surface = readFileSync(
      join(ROOT, 'src/design-system/components/grid/LedgerGridSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /<GridColumnGutter[\s\S]{0,400}data-table-surface/);
    assert.doesNotMatch(surface, /columnTriggerPortalOnly/);
  });

  /**
   * Surfaces that reach a LedgerGrid with NO ▦ host, so column display is
   * unreachable there. This is a LOSS LEDGER, not an exemption: each row is a
   * surface owing a Band-3 controls slot (or an inspector View cluster).
   *
   * It exists because `COLUMN_DISPLAY_SURFACES` below proves PLUMBING, never
   * PAINT — it stays green through a total loss of the control.
   *
   * **Shrink-only.** Wiring a host removes a line; nothing may add one.
   */
  const NO_COLUMN_DISPLAY_HOST: Readonly<Record<string, string>> = {
    'src/components/warranty/WarrantyClaimsTable.tsx':
      'WarrantyWorkspace has no WorkbenchTriageBand and the view wires no columnMenu',
    'src/components/receiving/unfound/UnfoundQueueTable.tsx':
      'PoMailboxAdminSection (/admin) has no Band-3 and the view wires no columnMenu',
    'src/components/tracking-exceptions/TrackingExceptionsTable.tsx':
      'bespoke FilterBar instead of WorkbenchTriageBand — host chrome not yet migrated',
    'src/components/scan-out/ScanOutWorkspace.tsx':
      'StagedQueueTable threads the target but the workspace passes none — already dark before 2026-08-08',
  };

  it('every no-host surface is recorded with its reason', () => {
    for (const [rel, why] of Object.entries(NO_COLUMN_DISPLAY_HOST)) {
      assert.ok(
        why.trim().length >= 20,
        `${rel}: say WHY column display is unreachable — this list is a debt ledger`,
      );
    }
  });

  /**
   * Band-3 + fieldsMenu surfaces must wire the portal end-to-end (norm 2026-08-06).
   * Surfaces with no host at all are absent from this list and recorded in
   * NO_COLUMN_DISPLAY_HOST above — they lost the control when the card-corner
   * float was deleted (2026-08-08) and owe a host.
   */
  it('Band-3 fieldsMenu desks portal ▦ into the triage controls slot', () => {
    const cases: { file: string; pattern: RegExp; why: string }[] = [
      {
        file: 'src/components/receiving/pickup/PickupWorkspace.tsx',
        pattern: /controlsSlotRef=\{setPickupControlsEl\}[\s\S]*columnTriggerPortalTarget=\{pickupControlsEl\}/,
        why: 'Pickup',
      },
      {
        file: 'src/components/warehouse/LocationsWorkspace.tsx',
        pattern: /controlsSlotRef=\{setBinsControlsEl\}[\s\S]*columnTriggerPortalTarget=\{binsControlsEl\}/,
        why: 'Locations / Bins',
      },
      {
        file: 'src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx',
        pattern: /controlsSlotRef=\{controlsSlotRef\}/,
        why: 'History triage band accepts portal host',
      },
      {
        file: 'src/components/station/ReceivingLinesTable.tsx',
        pattern: /historyControlsEl/,
        why: 'standalone History wires portal target',
      },
      {
        file: 'src/components/station/ReceivingLinesTable.tsx',
        pattern: /isInboundDocked[\s\S]{0,80}incomingControlsEl/,
        why: 'Incoming Docked uses incomingControlsEl',
      },
      {
        file: 'src/components/tech/TestingHistoryList.tsx',
        pattern: /columnTriggerPortalTarget=\{toolbarPortalTarget\}/,
        why: 'Testing Pending/Returns/History',
      },
      {
        file: 'src/components/outbound/labels/LabelsWorkspaceView.tsx',
        pattern: /columnTriggerPortalTarget=\{labelsControlsEl\}/,
        why: 'Labels Queue + Recent',
      },
      {
        file: 'src/components/outbound/scan-out/StagedQueueTable.tsx',
        pattern: /columnTriggerPortalTarget/,
        why: 'StagedQueueTable accepts portal (Labels Recent; Scan-out omits)',
      },
      {
        file: 'src/components/dashboard/DashboardOrdersView.tsx',
        pattern: /OrdersDrillHost[\s\S]{0,120}columnTriggerPortalTarget=\{controlsEl\}/,
        why: 'To-ship Drill (View topics portal)',
      },
      {
        file: 'src/components/dashboard/DashboardOrdersView.tsx',
        pattern: /OrdersCompareHost[\s\S]{0,120}columnTriggerPortalTarget=\{controlsEl\}/,
        why: 'To-ship Compare (View topics portal)',
      },
      {
        file: 'src/components/outbound/orders/OrdersViewTopicsCluster.tsx',
        pattern: /ref=\{setControlsEl\}/,
        why: 'To-ship View topics host grid-owned ▦ / lane-date portal',
      },
    ];
    for (const { file, pattern, why } of cases) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      assert.match(src, pattern, `${why} must portal ▦ into the controls host (${file})`);
    }
  });

  it('neither grid header reserves space for, or mounts, the column-display control', () => {
    for (const file of GRID_HEADERS) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      // Strip comments — the docblocks explain the retired `pr-9` on purpose.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.doesNotMatch(code, /\bpr-9\b/, `${file} must not pad the header row for it`);
      assert.doesNotMatch(
        code,
        /data-grid-column-details-lip|GridColumnDetailsTrigger/,
        `${file} must not mount the column-display control — it belongs in the gutter`,
      );
    }
  });

  it('drag-resize is one handle, gated by one shared rule', () => {
    const header = readFileSync(join(ROOT, GRID_HEADERS[0]), 'utf8');
    assert.match(header, /import \{ ColumnResizeHandle \} from '\.\/ColumnResizeHandle'/);
    assert.match(header, /isGridColumnResizable\(column\)/);

    const orders = readFileSync(join(ROOT, GRID_HEADERS[1]), 'utf8');
    assert.match(
      orders,
      /from '@\/design-system\/components\/grid\/ColumnResizeHandle'/,
      'Orders must compose the DS handle, not a queue-local copy',
    );

    // The fixed-format types render a last-8 chip or a short numeral run, so a
    // drag on them only moves whitespace.
    const rule = readFileSync(
      join(ROOT, 'src/design-system/components/grid/grid-column-editability.ts'),
      'utf8',
    );
    assert.match(rule, /FIXED_WIDTH_COLUMN_TYPES = new Set\(\['number', 'price'\]\)/);

    // Widths persist per staff, and the write must not drop its siblings: the
    // whole tableColumns map is sent, so a widths-only write that forgot
    // `hidden` / `order` would silently reset a curated view.
    const widths = readFileSync(
      join(ROOT, 'src/components/ui/table-column-config/useGridColumnWidths.ts'),
      'utf8',
    );
    assert.match(widths, /\.\.\.prev\.tableColumns\?\.\[tableId\], widths: nextWidths/);
  });

  it('no workspace chrome mounts a column picker (Fields is retired)', () => {
    const hits: string[] = [];
    for (const file of walkTsx(join(ROOT, 'src'))) {
      if (file.endsWith('workbench-trailing-cluster.guard.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (/<\s*GridFieldsMenu\b/.test(text) || /\bfields=\{/.test(text)) {
        hits.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(
      hits,
      [],
      `Column Fields belongs on the grid header lip, not page chrome: ${hits.join(', ')}`,
    );
  });

  it('Incoming uses tableId incoming; History/Unbox keep receiving', () => {
    const linesTable = readFileSync(
      join(ROOT, 'src/components/station/ReceivingLinesTable.tsx'),
      'utf8',
    );
    // The prefs-bucket DEFAULT moved from a prop literal to the table definition
    // when Incoming migrated onto the registry host (plan Phase 1). The bucket
    // is unchanged — `inbound.incoming` persists under `incoming`, distinct from
    // `receiving.browse`'s `receiving` — so the guard reads it off the SoT.
    assert.equal(INCOMING_TABLE_DEFINITION.tableId, 'incoming');
    assert.equal(RECEIVING_BROWSE_DEFINITION.tableId, 'receiving');
    // Incoming vs History share ReceivingLinesTable — prefs bucket is mode-gated.
    assert.match(linesTable, /tableId=\{isIncomingMode \? 'incoming' : 'receiving'\}/);
  });

  it('bans TableActionBar component / JSX under src/ (comments OK)', () => {
    const hits: string[] = [];
    // Real invent signal: export/function/class or JSX tag — not “never invent” prose.
    const invent = /(?:export\s+(?:function|const|class)\s+TableActionBar\b|function\s+TableActionBar\b|<\s*TableActionBar\b)/;
    for (const file of walkTsx(join(ROOT, 'src'))) {
      if (file.endsWith('workbench-trailing-cluster.guard.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (invent.test(text)) {
        hits.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(hits, [], `TableActionBar must not appear: ${hits.join(', ')}`);
  });
});
