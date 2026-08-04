import { test, expect, type Page } from '@playwright/test';
import {
  BINS_GRID_COLUMNS,
  type BinsGridColumnKey,
} from '@/components/warehouse/bins-grid/bins-grid-layout';

/**
 * Warehouse › Bins — the hand-rolled `<table>` → `LedgerGridSurface` migration
 * (thin-ledger-adapters Wave 1).
 *
 * Deterministic + DB-independent: `/api/inventory/bins-overview` is route-mocked
 * (the `ready-grid` / `warranty-grid` precedent), so checkbox select, core
 * columns, and durable `?colsort=` are exercised against known data.
 */

interface MockBin {
  id: number;
  barcode: string | null;
  name: string;
  room: string | null;
  row_label: string | null;
  col_label: string | null;
  capacity: number | null;
  bin_type: string | null;
  zone_letter: string | null;
  total_qty: number;
  sku_count: number;
  fill_pct: number | null;
  last_counted: string | null;
  is_empty: boolean;
  is_stale: boolean;
  has_low_stock: boolean;
  is_over_capacity: boolean;
}

function makeBin(i: number, overrides: Partial<MockBin> = {}): MockBin {
  return {
    id: 550_000 + i,
    barcode: `BIN-E2E-${100 + i}`,
    name: `Bin ${i}`,
    room: i % 2 === 0 ? 'A' : 'B',
    row_label: `R${i}`,
    col_label: `C${i}`,
    capacity: 100,
    bin_type: 'shelf',
    zone_letter: 'Z',
    total_qty: 10 + i * 5,
    sku_count: 1 + i,
    fill_pct: (10 + i * 5) / 100,
    last_counted: `2026-07-${15 + (i % 5)}T12:00:00.000Z`,
    is_empty: false,
    is_stale: false,
    has_low_stock: false,
    is_over_capacity: false,
    ...overrides,
  };
}

const BINS: MockBin[] = [
  makeBin(0, { barcode: 'BIN-ZULU', room: 'Z', sku_count: 9 }),
  makeBin(1, { barcode: 'BIN-ALPHA', room: 'A', sku_count: 2 }),
  makeBin(2, { barcode: 'BIN-MID', room: 'M', fill_pct: null, last_counted: null }),
  makeBin(3, { barcode: 'BIN-BETA', room: 'B', is_stale: true, has_low_stock: true }),
];

async function mockBins(page: Page, rows: MockBin[] = BINS) {
  await page.route(
    (url) => url.pathname === '/api/inventory/bins-overview',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          rows,
          counts: {
            total: rows.length,
            empty: rows.filter((r) => r.is_empty).length,
            stale: rows.filter((r) => r.is_stale).length,
            low_stock: rows.filter((r) => r.has_low_stock).length,
            over_capacity: rows.filter((r) => r.is_over_capacity).length,
          },
        }),
      });
    },
  );
  // Locations feed the filter bar rooms dropdown — keep it quiet.
  await page.route(
    (url) => url.pathname === '/api/locations',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rooms: [], bins: [], roomStructure: {} }),
      });
    },
  );
}

const gridBody = (page: Page) => page.getByTestId('bins-grid-body');
const rows = (page: Page) => gridBody(page).locator('[data-bins-row-id]');
const headerCell = (page: Page, key: BinsGridColumnKey) =>
  gridBody(page).locator(`[data-grid-col-header] [data-col="${key}"]`).first();

test.describe('Warehouse · Bins overview grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  test('renders the LedgerGrid surface — not a hand-rolled table', async ({ page }) => {
    await mockBins(page);
    await page.goto('/inventory/locations?tab=bins', { waitUntil: 'domcontentloaded' });

    const body = gridBody(page);
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(rows(page)).toHaveCount(BINS.length);
    await expect(body.locator('table')).toHaveCount(0);
    await expect(body.getByRole('table', { name: 'Warehouse bins' })).toBeVisible();
  });

  test('every core column owns a track', async ({ page }) => {
    await mockBins(page);
    await page.goto('/inventory/locations?tab=bins', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    for (const col of BINS_GRID_COLUMNS) {
      if (col.tier === 'optional') continue;
      if (col.key === 'select') continue;
      await expect(headerCell(page, col.key)).toHaveCount(1);
    }
  });

  test('checkbox select toggles bulk membership without opening the flyout alone', async ({
    page,
  }) => {
    await mockBins(page);
    await page.goto('/inventory/locations?tab=bins', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    const alpha = rows(page).filter({ hasText: 'BIN-ALPHA' }).first();
    const checkbox = alpha.getByRole('checkbox', { name: /Select BIN-ALPHA/i });
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  test('column sort is URL-durable on ?colsort= and survives a reload', async ({ page }) => {
    await mockBins(page);
    await page.goto('/inventory/locations?tab=bins', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    await headerCell(page, 'barcode').click();
    await expect(page).toHaveURL(/[?&]colsort=barcode(&|$)/);

    const firstBarcode = async () =>
      (await rows(page).first().locator('[data-col="barcode"]').innerText()).trim();
    expect(await firstBarcode()).toContain('BIN-ALPHA');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await firstBarcode()).toContain('BIN-ALPHA');
  });

  test('settled-empty shows the filters empty message', async ({ page }) => {
    await mockBins(page, []);
    await page.goto('/inventory/locations?tab=bins', { waitUntil: 'domcontentloaded' });
    await expect(gridBody(page).getByText(/No bins match the current filters/)).toBeVisible({
      timeout: 20_000,
    });
  });
});
