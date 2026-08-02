/**
 * WorkbenchTrailingCluster — Sort → Import → Add skeleton, and the ban on
 * chrome-altitude column Fields.
 *
 * Fields left the page chrome on 2026-08-02. The operator entry for column
 * visibility / display is the grid's own top-right column-display control
 * (`LedgerGridColumnHeader` `onOpenColumnDetails` → `GridColumnDetailsPanel`).
 * Rationale: Fields mutates the column set of the card it sits on, so a
 * page-chrome control acting on that card is an altitude mismatch — and seven
 * surfaces shipped BOTH doors onto the same rail id at once.
 *
 * That control is **hover-revealed over the card's own top-right corner**, and
 * reserves no space in either budget (amended the same day, twice). A permanent
 * `w-9` header track plus `pr-9` taxed every ROW of every grid; a permanent
 * gutter beside the card taxed every PAGE instead — same overpayment, different
 * budget. Revealed on hover / focus-within, and pinned while its own rail is
 * open, it costs neither. Overlapping the trailing label is acceptable only
 * because it is transient: the version that sat there at rest covered
 * `TRACKING`, and that is the bug.
 *
 * This does not relax the sticky-docking law: the banned shape is a Sheets-like
 * `TableActionBar` ABOVE the grid, which would add a second sticky layer to the
 * scroll port. That ban is asserted below and is unchanged — a floating,
 * absolutely-positioned trigger adds no sticky layer.
 *
 * @see .claude/rules/display/workbench-ops-queue.md → Trailing Display & Actions
 * @see docs/todo/fields-to-notion-header-hover-HANDOFF.md
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

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
      // The door is the gutter beside the card, not a control in the header.
      assert.match(
        viewSrc,
        /(columnDetails=\{\{|<GridColumnGutter)/,
        `${view} must mount the column-display gutter beside its card`,
      );
      assert.doesNotMatch(
        viewSrc,
        /onOpenColumnDetails=\{/,
        `${view} must not pass onOpenColumnDetails to its header — the gutter owns it`,
      );
      assert.match(
        viewSrc,
        /<GridColumnDetailsPanel/,
        `${view} must mount the column-display rail`,
      );
    });
  }

  it('the column-display control reserves no layout — hover-revealed, not resident', () => {
    const src = readFileSync(join(ROOT, TRIGGER), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.match(code, /export function GridColumnGutter/);
    // Floats over the card — reserving neither a column track nor a page lane.
    assert.match(code, /absolute right-1\.5 top-1\.5/, 'must float over the card corner');
    assert.doesNotMatch(code, /\bgap-2\b/, 'a reserved gutter is the shape this replaced');
    // Hidden at rest, revealed by pointer OR keyboard, pinned while open. All
    // three matter: hover alone is keyboard-unreachable, and a trigger that left
    // with the pointer would strand the rail it opened with no visible owner.
    assert.match(code, /opacity-0 group-hover\/grid-card:opacity-100/, 'pointer reveal');
    assert.match(code, /group-focus-within\/grid-card:opacity-100/, 'keyboard reveal');
    assert.match(code, /open && 'opacity-100'/, 'stays painted while its rail is open');
    // An invisible box over the header's right end would eat last-column clicks.
    assert.match(code, /pointer-events-none absolute/, 'inert while hidden');
    assert.match(code, /pointer-events-auto/, 'clickable while shown');
    // CSS opacity only — a framer whileHover here binds a re-render to mousemove
    // across the whole card.
    assert.doesNotMatch(code, /whileHover/, 'never a framer hover on a grid card');

    // The surface mounts the card INSIDE the wrapper.
    const surface = readFileSync(
      join(ROOT, 'src/design-system/components/grid/LedgerGridSurface.tsx'),
      'utf8',
    );
    assert.match(surface, /<GridColumnGutter[\s\S]{0,220}data-table-surface/);
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
      assert.doesNotMatch(
        code,
        /onOpenColumnDetails/,
        `${file} must not take onOpenColumnDetails — the surface owns the gutter`,
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
    assert.match(rule, /FIXED_WIDTH_COLUMN_TYPES = new Set\(\['number', 'id', 'location'\]\)/);

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
