import { test, expect, type Page } from '@playwright/test';
import {
  TRACKING_EXCEPTIONS_GRID_COLUMNS,
  type TrackingExceptionsGridColumnKey,
} from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-layout';

/**
 * Ops › Tracking Exceptions — the hand-rolled `<table>` → `LedgerGridSurface`
 * migration (thin-ledger-adapters Wave 1).
 *
 * Deterministic + DB-independent: `/api/tracking-exceptions` is route-mocked
 * (the `pending-grid-tanstack-tested` / warranty-grid precedent), because the
 * QA org may have zero open exceptions and `test.skip`-ing around missing data
 * would hide exactly the coverage this wave needs.
 *
 * Header labels come from the layout SoT rather than re-typed literals.
 */

interface MockException {
  id: number;
  tracking_number: string;
  domain: 'receiving';
  source_station: string;
  staff_id: number | null;
  staff_name: string | null;
  staff_display_name: string | null;
  exception_reason: string;
  notes: string | null;
  status: 'open' | 'resolved' | 'discarded';
  shipment_id: number | null;
  receiving_id: number | null;
  last_zoho_check_at: string | null;
  zoho_check_count: number;
  last_error: string | null;
  domain_metadata: Record<string, unknown> | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  receiving_source: string | null;
  receiving_zoho_po_id: string | null;
  receiving_carrier: string | null;
}

function makeException(i: number, overrides: Partial<MockException> = {}): MockException {
  const day = 10 + (i % 5);
  return {
    id: 990_000 + i,
    tracking_number: `1Z999AA1012345678${i}`,
    domain: 'receiving',
    source_station: 'receiving-desk',
    staff_id: 1,
    staff_name: `Staff ${i}`,
    staff_display_name: `Operator ${String.fromCharCode(65 + (i % 6))}`,
    exception_reason: 'not_found',
    notes: null,
    status: 'open',
    shipment_id: null,
    receiving_id: null,
    last_zoho_check_at: `2026-07-${day}T15:00:00.000Z`,
    zoho_check_count: i,
    last_error: null,
    domain_metadata: { carrier: 'UPS' },
    resolved_at: null,
    created_at: `2026-07-${day}T12:00:00.000Z`,
    updated_at: `2026-07-${day}T15:00:00.000Z`,
    receiving_source: null,
    receiving_zoho_po_id: null,
    receiving_carrier: null,
    ...overrides,
  };
}

const ROWS: MockException[] = [
  makeException(0, {
    tracking_number: '1Z999AA10123456780',
    domain_metadata: { carrier: 'Zulu Express' },
    created_at: '2026-07-14T12:00:00.000Z',
  }),
  makeException(1, {
    tracking_number: '1Z999AA10123456781',
    domain_metadata: { carrier: 'Alpha Freight' },
    created_at: '2026-07-12T12:00:00.000Z',
  }),
  // Never checked — must sort LAST in both directions on lastCheck (opt-in col).
  makeException(2, {
    tracking_number: '1Z999AA10123456782',
    domain_metadata: { carrier: 'Mid Carrier' },
    last_zoho_check_at: null,
    created_at: '2026-07-13T12:00:00.000Z',
  }),
  makeException(3, {
    tracking_number: '1Z999AA10123456783',
    domain_metadata: { carrier: 'Beta Ship' },
    status: 'open',
    created_at: '2026-07-11T12:00:00.000Z',
  }),
];

async function mockExceptions(page: Page, rows: MockException[] = ROWS) {
  await page.route(
    (url) => url.pathname === '/api/tracking-exceptions',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, rows, total: rows.length }),
      });
    },
  );
}

const gridBody = (page: Page) => page.getByTestId('tracking-exceptions-grid-body');
const rows = (page: Page) => gridBody(page).locator('[data-tracking-exception-row-id]');
const headerCell = (page: Page, key: TrackingExceptionsGridColumnKey) =>
  gridBody(page).locator(`[data-grid-col-header] [data-col="${key}"]`).first();

test.describe('Ops · Tracking Exceptions grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  test('renders the LedgerGrid surface — not a hand-rolled table', async ({ page }) => {
    await mockExceptions(page);
    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });

    const body = gridBody(page);
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(rows(page)).toHaveCount(ROWS.length);
    await expect(body.locator('table')).toHaveCount(0);
    await expect(body.getByRole('table', { name: 'Tracking exceptions' })).toBeVisible();
  });

  test('every core column owns a track; optional columns stay opt-in', async ({ page }) => {
    await mockExceptions(page);
    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    for (const col of TRACKING_EXCEPTIONS_GRID_COLUMNS) {
      if (col.tier === 'optional') continue;
      if (col.key === 'select') continue;
      const cell = headerCell(page, col.key);
      await expect(cell).toHaveCount(1);
      if (col.label) {
        await expect(cell).toContainText(col.label, { ignoreCase: true });
      }
    }

    await expect(headerCell(page, 'source')).toHaveCount(0);
    await expect(headerCell(page, 'staff')).toHaveCount(0);
    await expect(headerCell(page, 'retries')).toHaveCount(0);
    await expect(headerCell(page, 'lastCheck')).toHaveCount(0);
    await expect(headerCell(page, 'notes')).toHaveCount(0);
  });

  test('clicking a row opens the edit dialog (record plane)', async ({ page }) => {
    await mockExceptions(page);
    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    const id = await first.getAttribute('data-tracking-exception-row-id');
    await first.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Edit exception #${id}` })).toBeVisible();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  test('column sort is URL-durable on ?colsort= and survives a reload', async ({ page }) => {
    await mockExceptions(page);
    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    await headerCell(page, 'carrier').click();
    await expect(page).toHaveURL(/[?&]colsort=carrier(&|$)/);
    await expect(page).not.toHaveURL(/[?&]sort=carrier(&|$)/);

    const firstCarrier = async () =>
      (await rows(page).first().locator('[data-col="carrier"]').innerText()).trim();
    expect(await firstCarrier()).toBe('Alpha Freight');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await firstCarrier()).toBe('Alpha Freight');
  });

  test('the refresh control is row-scoped — it never opens the edit dialog', async ({ page }) => {
    await mockExceptions(page);
    // Refresh POSTs to a per-id route — keep it quiet so the click stays local.
    await page.route(
      (url) => /\/api\/tracking-exceptions\/\d+\/refresh$/.test(url.pathname),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      },
    );
    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    await first.locator('[data-col="actions"] button[aria-label="Refresh from Zoho"]').click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('settled-empty distinguishes absence from no-match', async ({ page }) => {
    await mockExceptions(page, []);

    await page.goto('/tracking-exceptions', { waitUntil: 'domcontentloaded' });
    await expect(gridBody(page).getByText('No exceptions in this view.')).toBeVisible({
      timeout: 20_000,
    });

    // Type into the search box — the SAME zero rows must invite clearing it.
    await page.getByPlaceholder('Search tracking…').fill('zzz-no-match');
    await expect(gridBody(page).getByText('No exceptions match this search.')).toBeVisible({
      timeout: 20_000,
    });
  });
});
