import { test, expect, type Page } from '@playwright/test';
import {
  WARRANTY_GRID_COLUMNS,
  type WarrantyGridColumnKey,
} from '@/components/warranty/grid/warranty-grid-layout';

/**
 * Support › Warranty — the hand-rolled `<table>` → `LedgerGridSurface` migration
 * (table-SoT Phase 3, wave 1).
 *
 * Deterministic + DB-independent: `/api/warranty/claims` is route-mocked (the
 * `pending-grid-tanstack-tested` precedent), because the QA org ships no
 * warranty fixtures and `test.skip`-ing around missing data would hide exactly
 * the coverage this wave needs (`verify.md` → E2E on the QA org).
 *
 * Header labels come from the layout SoT rather than re-typed literals — the
 * copies that drifted on other surfaces did so the moment a column was renamed,
 * and the stale locators just resolved to zero elements.
 */

interface MockClaim {
  id: number;
  claimNumber: string;
  serialNumber: string | null;
  sku: string | null;
  productTitle: string | null;
  customerName: string | null;
  status: string;
  clockBasis: string | null;
  daysRemaining: number | null;
  zendeskTicketId: number | null;
  createdAt: string;
}

function makeClaim(i: number, overrides: Partial<MockClaim> = {}): MockClaim {
  const day = 10 + (i % 5);
  return {
    id: 880_000 + i,
    claimNumber: `WC-2026-${4100 + i}`,
    serialNumber: `SNW${900_000 + i}`,
    sku: `WSKU-${i}`,
    productTitle: `E2E Warranty Item ${i}`,
    customerName: `Customer ${String.fromCharCode(65 + (i % 6))}`,
    status: 'OPEN',
    clockBasis: 'DELIVERED',
    daysRemaining: 30 - i * 3,
    zendeskTicketId: null,
    createdAt: `2026-07-${day}T17:30:00.000Z`,
    ...overrides,
  };
}

const CLAIMS: MockClaim[] = [
  makeClaim(0, { customerName: 'Zeta Holdings', daysRemaining: 2 }),
  makeClaim(1, { customerName: 'Alpha Retail', daysRemaining: 25 }),
  // No computed clock — must sort LAST in both directions, never as 0.
  makeClaim(2, { customerName: 'Mid Supply', daysRemaining: null, clockBasis: null }),
  makeClaim(3, { customerName: 'Beta Traders', daysRemaining: 11, zendeskTicketId: 5150 }),
];

async function mockClaims(page: Page, claims: MockClaim[] = CLAIMS) {
  await page.route(
    (url) => url.pathname === '/api/warranty/claims',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, claims }),
      });
    },
  );
  // The coverage-lookup card above the grid shares the search box; keep it quiet
  // so a failed lookup never colours the grid assertions.
  await page.route(
    (url) => url.pathname.startsWith('/api/warranty/coverage'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, coverage: null }),
      });
    },
  );
}

const gridBody = (page: Page) => page.getByTestId('warranty-grid-body');
const rows = (page: Page) => gridBody(page).locator('[data-warranty-row-id]');
const headerCell = (page: Page, key: WarrantyGridColumnKey) =>
  gridBody(page).locator(`[data-grid-col-header] [data-col="${key}"]`).first();

test.describe('Support · Warranty claims grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  // Mocked per test, NOT in a beforeEach: the empty-state test needs a
  // different payload, and layering a second `page.route` over the first would
  // make these assertions depend on Playwright's handler-precedence order
  // rather than on the app.

  test('renders the LedgerGrid surface — not a hand-rolled table', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });

    const body = gridBody(page);
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(rows(page)).toHaveCount(CLAIMS.length);

    // The migration's whole point: no `<table>` markup left on this surface.
    await expect(body.locator('table')).toHaveCount(0);
    // And it announces as a named table for AT.
    await expect(body.getByRole('table', { name: 'Warranty claims' })).toBeVisible();
  });

  test('every core column owns a track, labelled from the layout SoT', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    for (const col of WARRANTY_GRID_COLUMNS) {
      if (col.tier === 'optional') continue; // ships OFF — opt-in via Fields
      // `select` is the gutter: `LedgerGridColumnHeader` filters it out of the
      // data columns and paints it as a dedicated sticky cell (which is where
      // select-all lives on the surfaces that have it), so it carries no
      // `data-col`. Every OTHER core column must own a real track.
      if (col.key === 'select') continue;
      const cell = headerCell(page, col.key);
      await expect(cell).toHaveCount(1);
      if (col.label) {
        // Adaptive header: the label when the track fits, else the type glyph
        // with an sr-only name. Either way the NAME must be present.
        await expect(cell).toContainText(col.label, { ignoreCase: true });
      }
    }

    // `serial` is tier:'optional' — absent until a staffer opts in.
    await expect(headerCell(page, 'serial')).toHaveCount(0);
  });

  test('clicking a row opens the record plane via ?open=', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    const id = await first.getAttribute('data-warranty-row-id');
    await first.click();

    await expect(page).toHaveURL(new RegExp(`[?&]open=${id}(&|$)`));
    await expect(first).toHaveAttribute('aria-pressed', 'true');
  });

  test('column sort is URL-durable on ?colsort= and survives a reload', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    await headerCell(page, 'customer').click();
    await expect(page).toHaveURL(/[?&]colsort=customer(&|$)/);
    // Never the station/server pair — that is the collision the param split exists for.
    await expect(page).not.toHaveURL(/[?&]sort=customer(&|$)/);

    const firstCustomer = async () =>
      (await rows(page).first().locator('[data-col="customer"]').innerText()).trim();
    expect(await firstCustomer()).toBe('Alpha Retail');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await firstCustomer()).toBe('Alpha Retail');
  });

  test('a claim with no computed clock sorts last in BOTH directions', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    const lastClaimNumber = async () =>
      (await rows(page).last().locator('[data-col="claim"]').innerText()).trim();

    const nullClockTail = CLAIMS[2].claimNumber.slice(-4);

    // asc — soonest expiry first, unknown parked at the bottom.
    await headerCell(page, 'warranty').click();
    await expect(page).toHaveURL(/[?&]colsort=warranty(&|$)/);
    expect(await lastClaimNumber()).toContain(nullClockTail);

    // desc — most cover first; the unknown must NOT float to the top as if it
    // were maximum cover (the fold-null-to-a-number bug).
    await headerCell(page, 'warranty').click();
    await expect(page).toHaveURL(/[?&]coldir=desc(&|$)/);
    expect(await lastClaimNumber()).toContain(nullClockTail);
  });

  test('the ticket control is row-scoped — it never opens the record', async ({ page }) => {
    await mockClaims(page);
    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    const first = rows(page).first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    await first.locator('[data-col="ticket"] button').first().click();

    // Row-scoped plane fired; the record plane stayed closed.
    await expect(page).not.toHaveURL(/[?&]open=/);
  });

  test('settled-empty distinguishes absence from no-match', async ({ page }) => {
    await mockClaims(page, []);

    await page.goto('/support?mode=warranty', { waitUntil: 'domcontentloaded' });
    await expect(gridBody(page).getByText('No warranty claims logged yet.')).toBeVisible({
      timeout: 20_000,
    });

    // With a filter on, the SAME zero rows must invite clearing it instead of
    // saying the data does not exist.
    await page.goto('/support?mode=warranty&wexp=1', { waitUntil: 'domcontentloaded' });
    await expect(
      gridBody(page).getByText('No warranty claims match these filters.'),
    ).toBeVisible({ timeout: 20_000 });
  });
});
