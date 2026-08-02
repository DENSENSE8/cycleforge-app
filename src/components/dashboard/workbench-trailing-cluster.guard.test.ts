/**
 * WorkbenchTrailingCluster — Sort → Import → Add skeleton, and the ban on
 * chrome-altitude column Fields.
 *
 * Fields left the page chrome on 2026-08-02. The operator entry for column
 * visibility / display is the grid's own top-right header lip
 * (`LedgerGridColumnHeader` `onOpenColumnDetails` → `GridColumnDetailsPanel`).
 * Rationale: Fields mutates the column set of the card it sits on, so a
 * page-chrome control acting on that card is an altitude mismatch — and seven
 * surfaces shipped BOTH doors onto the same rail id at once.
 *
 * This does not relax the sticky-docking law. The lip renders inside the
 * already-sticky `[data-grid-col-header]` band, so the scroll port still has
 * exactly one sticky layer; the banned shape is a Sheets-like `TableActionBar`
 * ABOVE the grid, which would add a second one. That ban is asserted below and
 * is unchanged.
 *
 * @see .claude/rules/display/workbench-ops-queue.md → Trailing Display & Actions
 * @see docs/todo/fields-chrome-to-table-lip-HANDOFF.md
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SHELL = join(ROOT, 'src/components/dashboard/workbench-shell.tsx');

/**
 * Surfaces that must compose WorkbenchTrailingCluster for sort/actions
 * (honest absence OK — several now render nothing there and pass no `trailing`).
 */
const TRAILING_CLUSTER_ADOPTERS = [
  'src/components/packer/PackWorkspaceHeader.tsx',
  'src/components/tech/testing/TestingWorkspaceHeader.tsx',
  'src/components/tech/shipping/ShippingWorkspaceHeader.tsx',
  'src/components/outbound/labels/LabelsWorkspaceHeader.tsx',
  'src/components/support/zendesk/SupportTicketsBoard.tsx',
  'src/components/photos/PhotoLibraryWorkspaceHeader.tsx',
] as const;

/**
 * Every grid that declares `fieldsMenu: true` must expose the lip, or its staff
 * lose column display entirely. Header adapter → the view that owns the rail.
 */
const LIP_SURFACES: readonly (readonly [header: string, view: string])[] = [
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

  for (const [header, view] of LIP_SURFACES) {
    it(`${view} reaches column display through the header lip`, () => {
      const headerSrc = readFileSync(join(ROOT, header), 'utf8');
      const viewSrc = readFileSync(join(ROOT, view), 'utf8');
      // A family either composes the factory — which forwards the lip props by
      // construction, which is the whole reason it exists — or, if it is a
      // bespoke header (Orders), plumbs them itself.
      assert.ok(
        /makeLedgerGridColumnHeader/.test(headerSrc) || /onOpenColumnDetails/.test(headerSrc),
        `${header} must compose makeLedgerGridColumnHeader or plumb onOpenColumnDetails itself`,
      );
      assert.match(
        viewSrc,
        /onOpenColumnDetails=\{/,
        `${view} must pass onOpenColumnDetails to its column header`,
      );
      assert.match(
        viewSrc,
        /<GridColumnDetailsPanel/,
        `${view} must mount the column-display rail`,
      );
    });
  }

  it('the lip anchors inside the sticky header band, not a second sticky layer', () => {
    const lipHost = readFileSync(
      join(ROOT, 'src/design-system/components/grid/LedgerGrid.tsx'),
      'utf8',
    );
    // `relative` on the [data-grid-col-header] band is what lets the lip be
    // absolutely positioned WITHOUT introducing its own `sticky` element.
    const band = lipHost.slice(lipHost.indexOf('data-grid-col-header'));
    assert.match(band.slice(0, 400), /'relative sticky top-0/);

    for (const file of [
      'src/design-system/components/grid/LedgerGridColumnHeader.tsx',
      'src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx',
    ]) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      const lip = src.slice(src.indexOf('data-grid-column-details-lip'));
      const decl = lip.slice(0, 300);
      assert.match(decl, /absolute inset-y-0 right-0/, `${file} lip must be absolute`);
      // `position: sticky` — NOT the `z-sticky` z-index token, which the lip
      // legitimately uses to sit above the header cells it overlaps.
      assert.doesNotMatch(
        decl,
        /(^|[\s"'`])sticky[\s"'`-]/,
        `${file} lip must not add a second sticky layer`,
      );
    }
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
    const incomingGrid = readFileSync(
      join(ROOT, 'src/components/station/incoming-grid/IncomingGridView.tsx'),
      'utf8',
    );
    const linesTable = readFileSync(
      join(ROOT, 'src/components/station/ReceivingLinesTable.tsx'),
      'utf8',
    );
    assert.match(incomingGrid, /tableId = 'incoming'/);
    assert.match(linesTable, /tableId="incoming"/);
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
