import type { Page } from '@playwright/test';
import type { DesignLabViewpoint } from '@/lib/design-lab/catalog';

/**
 * Route-mocked feeds for the visual walk — plan §7.4.
 *
 * The idle walk used to measure the live dev database. A sibling E2E cleanup
 * emptied To-ship and the baseline became "No orders yet", which tests nothing
 * about the grid. Desks get a fixed row set. Stations and composers stay live
 * (chrome is the subject; masks cover clock faces).
 *
 * Shape copied from `pending-grid-tanstack-tested.spec.ts` (orders) and
 * `ledger-grid-column-display.spec.ts` (receiving lines). Other families get a
 * small JSON list on the API they already call — enough that the compound
 * engine paints rows instead of an empty stage.
 */

const STAMP = '2026-07-20T18:00:00.000Z';

function json(route: { fulfill: (r: { status: number; contentType: string; body: string; headers?: Record<string, string> }) => Promise<void> }, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'x-cache': 'BYPASS' },
    body: JSON.stringify(body),
  });
}

function orderRow(i: number, overrides: Record<string, unknown> = {}) {
  const day = 20 + (i % 3);
  const iso = `2026-07-${day}T18:00:00.000Z`;
  return {
    id: 910_000 + i,
    order_id: `90-9${1000 + i}-${20_000 + i}`,
    product_title: `Visual peer row ${i}`,
    sku: `VP-${i}`,
    item_number: i === 3 ? '12-345678901' : '',
    condition: i === 4 ? 'REFURBISHED' : 'USED',
    quantity: String(i === 5 ? 3 : 1),
    account_source: 'Goodwill',
    created_at: iso,
    order_date: i === 1 ? null : iso,
    deadline_at: iso,
    shipment_id: 720_000 + i,
    tracking_number: `9400111899223197${(100_000 + i).toString()}`,
    shipping_tracking_number: `9400111899223197${(100_000 + i).toString()}`,
    has_tech_scan: i < 2,
    is_out_of_stock: i === 6,
    notes: i === 7 ? 'Hold for customer call' : '',
    is_urgent: i === 8,
    latest_status_category: 'UNKNOWN',
    amount: i === 9 ? null : 49.99 + i,
    ...overrides,
  };
}

/** Priced/unpriced, urgent, blocked, note/none, multi-line — the §7.4 cell states. */
function ordersFixture() {
  const rows = [
    orderRow(0, { product_title: 'Visual TESTED priced', has_tech_scan: true, amount: 128.5 }),
    orderRow(1, { product_title: 'Visual unpriced import stamp', amount: null, order_date: null }),
    orderRow(2, { product_title: 'Visual note row', notes: 'Ship with extra foam' }),
    orderRow(3, { product_title: 'Visual listing handle' }),
    orderRow(4),
    orderRow(5, { product_title: 'Visual qty 3', quantity: '3' }),
    orderRow(6, { product_title: 'Visual BLOCKED', is_out_of_stock: true }),
    orderRow(7),
    orderRow(8, { product_title: 'Visual URGENT', is_urgent: true }),
    orderRow(9, { product_title: 'Visual unpriced sibling', amount: null }),
    orderRow(10, { order_id: '90-91111-30001', product_title: 'Visual multi-line A' }),
    orderRow(11, { order_id: '90-91111-30001', product_title: 'Visual multi-line B', sku: 'VP-11' }),
  ];
  return rows;
}

function receivingLine(i: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 990_000 + i,
    receiving_id: 990_000 + i,
    tracking_number: `95490154616762043${(10_000 + i).toString()}`,
    tracking_source: 'shipment',
    carrier: 'USPS',
    is_delivered: true,
    delivered_at: '2026-07-28 13:50:34.483609-07',
    zoho_purchaseorder_number: i >= 4 ? '04-14955-01736' : null,
    zoho_purchaseorder_id: i >= 4 ? '77700123' : null,
    item_name: `Visual receiving ${i}`,
    catalog_product_title: i === 1 ? null : `Visual receiving ${i}`,
    zoho_item_title: null,
    sku_catalog_id: null,
    sku: i === 2 ? null : `RCV-${i}`,
    quantity_received: i === 5 ? 3 : 1,
    quantity_expected: i === 5 ? 4 : 1,
    qa_status: i === 6 ? 'FAIL' : 'PENDING',
    workflow_status: 'DONE',
    disposition_code: i === 6 ? 'HOLD' : 'STOCK',
    condition_grade: i === 3 ? null : 'BRAND_NEW',
    disposition_audit: [],
    needs_test: i === 0,
    is_priority: i === 8,
    notes: i === 7 ? 'Opened wet' : '',
    unboxed_at: `2026-07-28 1${i % 9}:20:00-07`,
    scanned_at: '2026-07-28 09:00:00-07',
    received_at: '2026-07-28 09:00:00-07',
    source_platform: 'eBay',
    created_at: STAMP,
    ...overrides,
  };
}

async function mockOrders(page: Page) {
  const rows = ordersFixture();
  await page.route((url) => url.pathname === '/api/orders', (route) =>
    json(route, { orders: rows, count: rows.length }),
  );
  const tested = rows.filter((r) => r.has_tech_scan && !r.is_out_of_stock).length;
  const blocked = rows.filter((r) => r.is_out_of_stock).length;
  const pending = rows.length - tested - blocked;
  await page.route((url) => url.pathname === '/api/orders/queue-counts', (route) =>
    json(route, {
      total: rows.length,
      byStage: { all: rows.length, pending, tested },
      urgent: rows.filter((r) => r.is_urgent).length,
      mustShip: 4,
      combos: [
        { hasTechScan: true, blocked: false, count: tested },
        { hasTechScan: false, blocked: false, count: pending },
        { hasTechScan: false, blocked: true, count: blocked },
      ],
    }),
  );
}

async function mockReceivingLines(page: Page) {
  const lines = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => receivingLine(i));
  await page.route('**/api/receiving-lines**', (route) => json(route, { lines, count: lines.length }));
}

async function mockList(page: Page, pathIncludes: string, body: unknown) {
  await page.route(`**${pathIncludes}**`, (route) => json(route, body));
}

/**
 * Install desk-family mocks. No-op for stations / composers / mobile.
 * Call BEFORE `page.goto`.
 */
export async function installDeskFixtures(page: Page, viewpoint: DesignLabViewpoint): Promise<void> {
  if (viewpoint.section !== 'desks' || !viewpoint.tableId) return;

  switch (viewpoint.tableId) {
    case 'orders':
    case 'orders-import':
    case 'shortage-coverage-import':
      await mockOrders(page);
      return;
    case 'receiving':
    case 'ready':
    case 'tech-all':
      await mockReceivingLines(page);
      return;
    case 'incoming':
      await mockList(page, '/api/incoming', {
        pos: [{ id: 1, po_number: 'PO-VIS-1', created_at: STAMP, status: 'OPEN', item_count: 3 }],
        count: 1,
      });
      return;
    case 'catalog':
      await mockList(page, '/api/catalog', {
        products: [
          { id: 1, title: 'Visual catalog A', sku: 'CAT-A', created_at: STAMP },
          { id: 2, title: 'Visual catalog B', sku: 'CAT-B', created_at: STAMP },
        ],
        count: 2,
      });
      return;
    case 'inventory-units':
      await mockList(page, '/api/inventory/units', {
        units: [
          { id: 1, serial: 'SN-VIS-1', sku: 'UNIT-A', created_at: STAMP, status: 'IN_STOCK' },
          { id: 2, serial: 'SN-VIS-2', sku: 'UNIT-B', created_at: STAMP, status: 'RESERVED' },
        ],
        count: 2,
      });
      return;
    case 'bins':
      await mockList(page, '/api/inventory/bins', {
        bins: [
          { id: 1, code: 'A-01-01', occupancy: 4, created_at: STAMP },
          { id: 2, code: 'A-01-02', occupancy: 0, created_at: STAMP },
        ],
        count: 2,
      });
      return;
    case 'pickup':
      await mockList(page, '/api/pickup', {
        orders: [orderRow(0, { product_title: 'Visual pickup' })],
        count: 1,
      });
      return;
    case 'unfound':
      await mockList(page, '/api/unfound', {
        rows: [{ id: 1, tracking_number: '1ZVISUAL', created_at: STAMP, state: 'UNFOUND' }],
        count: 1,
      });
      return;
    case 'repair':
      await mockList(page, '/api/repair-service', {
        repairs: [{ id: 1, title: 'Visual repair', created_at: STAMP, status: 'OPEN' }],
        count: 1,
      });
      return;
    case 'warranty':
      await mockList(page, '/api/warranty/claims', {
        claims: [{ id: 1, claim_number: 'RMA-VIS-1', created_at: STAMP, status: 'OPEN' }],
        count: 1,
      });
      return;
    case 'tracking-exceptions':
      await mockList(page, '/api/tracking-exceptions', {
        exceptions: [{ id: 1, tracking_number: '9400VIS', carrier: 'USPS', created_at: STAMP }],
        count: 1,
      });
      return;
    case 'catalog-link':
    case 'import-exception':
      await mockList(page, '/api/review', {
        rows: [{ id: 1, product_title: 'Visual review row', created_at: STAMP }],
        count: 1,
      });
      return;
    case 'my-day':
      await mockList(page, '/api/my-day', {
        items: [{ id: 1, title: 'Visual today', created_at: STAMP }],
        count: 1,
      });
      return;
    case 'audit-log':
      await mockList(page, '/api/admin/audit', {
        rows: [{ id: 1, action: 'visual.peer', actor: 'fixture', created_at: STAMP }],
        count: 1,
      });
      return;
    default:
      return;
  }
}
