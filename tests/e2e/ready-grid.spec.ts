import { test, expect, type Page } from '@playwright/test';
import {
  READY_GRID_COLUMNS,
  type ReadyGridColumnKey,
} from '@/components/outbound/ready/grid/ready-grid-layout';

/**
 * Outbound › Ready — the hand-rolled `<table>` → `LedgerGridSurface` migration
 * (table-SoT Phase 3, wave 2).
 *
 * Deterministic + DB-independent: `/api/shipping/ready-queue` is route-mocked
 * (the `pending-grid-tanstack-tested` precedent), so the verdict / destination /
 * action cells and both empty answers are exercised against known data instead
 * of whatever the tenant happens to have tested today.
 */

interface MockHit {
  testingResultId: number;
  entityType: string;
  entityId: number;
  skuCatalogId: number | null;
  sku: string | null;
  serialNumber: string | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  conditionGrade: string | null;
  unitStatus: string | null;
  verdict: string | null;
  testedBy: number | null;
  testedByName: string | null;
  testedAt: string | null;
  disposition: string | null;
  allocationState: string;
  reasons: string[];
  score: number;
  velocityTier: string | null;
}

function makeHit(i: number, overrides: Partial<MockHit> = {}): MockHit {
  return {
    testingResultId: 770_000 + i,
    entityType: 'SERIAL_UNIT',
    entityId: 660_000 + i,
    skuCatalogId: null,
    sku: `RSKU-${i}`,
    serialNumber: `SNR${500_000 + i}`,
    fnsku: null,
    asin: null,
    title: `E2E Ready Unit ${i}`,
    conditionGrade: 'B',
    unitStatus: 'TESTED',
    verdict: 'PASS',
    testedBy: null,
    testedByName: `Tester ${i}`,
    testedAt: `2026-07-${20 + (i % 5)}T16:00:00.000Z`,
    disposition: 'FBA',
    allocationState: 'READY',
    reasons: ['HIGH_VELOCITY'],
    score: 10,
    velocityTier: 'A',
    ...overrides,
  };
}

const HITS: MockHit[] = [
  makeHit(0, { title: 'Zulu Amplifier', disposition: 'FBA', allocationState: 'READY' }),
  makeHit(1, {
    title: 'Alpha Receiver',
    disposition: 'PREBOX_STOCK',
    allocationState: 'READY',
    verdict: 'TESTING_FAILED',
  }),
  // No disposition — the cell must fall back to the ALLOCATION STATE label.
  makeHit(2, {
    title: 'Mid Turntable',
    disposition: null,
    allocationState: 'FBA_STAGED',
    verdict: 'TEST_AGAIN',
    reasons: [],
    velocityTier: null,
  }),
  // No tested instant — must sort LAST in both directions, never as "oldest".
  makeHit(3, { title: 'Nova Speaker', testedAt: null, testedByName: null, disposition: 'HOLD', allocationState: 'NOT_READY' }),
];

async function mockReady(page: Page, hits: MockHit[] = HITS) {
  await page.route(
    (url) => url.pathname === '/api/shipping/ready-queue',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hits }),
      });
    },
  );
}

const gridBody = (page: Page) => page.getByTestId('ready-grid-body');
const rows = (page: Page) => gridBody(page).locator('[data-ready-row-id]');
const headerCell = (page: Page, key: ReadyGridColumnKey) =>
  gridBody(page).locator(`[data-grid-col-header] [data-col="${key}"]`).first();

test.describe('Outbound · Ready tested-history grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  test('renders the LedgerGrid surface — not a hand-rolled table', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });

    const body = gridBody(page);
    await expect(body).toBeVisible({ timeout: 20_000 });
    await expect(rows(page)).toHaveCount(HITS.length);
    await expect(body.locator('table')).toHaveCount(0);
    await expect(body.getByRole('table', { name: 'Recently tested units' })).toBeVisible();
  });

  test('every core column owns a track; rationale columns stay opt-in', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    for (const col of READY_GRID_COLUMNS) {
      if (col.tier === 'optional') continue;
      // `select` is the gutter — rendered as a dedicated sticky cell with no
      // `data-col` (see LedgerGridColumnHeader).
      if (col.key === 'select') continue;
      await expect(headerCell(page, col.key)).toHaveCount(1);
    }

    // `reasons` / `velocity` are the WHY behind destination — off by default.
    await expect(headerCell(page, 'reasons')).toHaveCount(0);
    await expect(headerCell(page, 'velocity')).toHaveCount(0);
  });

  test('a hit with no disposition falls back to its allocation state', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    const staged = rows(page).filter({ hasText: 'Mid Turntable' }).first();
    await expect(staged.locator('[data-col="destination"]')).toContainText('In FBA');
  });

  test('the action cell only offers Stage FBA where it applies', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    const fbaRow = rows(page).filter({ hasText: 'Zulu Amplifier' }).first();
    await expect(fbaRow.locator('[data-col="action"]')).toContainText('Stage FBA');

    // READY + PREBOX_STOCK is not an FBA staging job.
    const preboxRow = rows(page).filter({ hasText: 'Alpha Receiver' }).first();
    await expect(preboxRow.locator('[data-col="action"]')).toContainText('Pre-box');
    await expect(preboxRow.locator('[data-col="action"] a')).toHaveCount(0);

    // Not ready at all → history, no control.
    const historyRow = rows(page).filter({ hasText: 'Nova Speaker' }).first();
    await expect(historyRow.locator('[data-col="action"]')).toContainText('History');
  });

  test('column sort is URL-durable on ?colsort= and survives a reload', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    await headerCell(page, 'title').click();
    await expect(page).toHaveURL(/[?&]colsort=title(&|$)/);
    // Never the outbound display-order pair — that is the collision the split exists for.
    await expect(page).not.toHaveURL(/[?&]sort=title(&|$)/);

    const firstTitle = async () =>
      (await rows(page).first().locator('[data-col="title"]').innerText()).trim();
    expect(await firstTitle()).toContain('Alpha Receiver');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    expect(await firstTitle()).toContain('Alpha Receiver');
  });

  test('an untested hit sorts last in BOTH directions', async ({ page }) => {
    await mockReady(page);
    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });

    const lastTitle = async () =>
      (await rows(page).last().locator('[data-col="title"]').innerText()).trim();

    await headerCell(page, 'tested').click();
    await expect(page).toHaveURL(/[?&]colsort=tested(&|$)/);
    expect(await lastTitle()).toContain('Nova Speaker');

    await headerCell(page, 'tested').click();
    expect(await lastTitle()).toContain('Nova Speaker');
  });

  test('settled-empty distinguishes absence from no-match', async ({ page }) => {
    await mockReady(page, []);

    await page.goto('/shipping/fba?fbaMode=ready', { waitUntil: 'domcontentloaded' });
    await expect(gridBody(page).getByText(/No tested units yet/)).toBeVisible({ timeout: 20_000 });

    // A tab filter narrows the same zero rows — the answer must change from
    // "nothing tested" to "nothing matches", and the grid must still render its
    // teaching box rather than bare headers over a void (the band-vs-row bug).
    await page.goto('/shipping/fba?fbaMode=ready&rtab=fba', { waitUntil: 'domcontentloaded' });
    await expect(gridBody(page).getByText(/No tested units match this view/)).toBeVisible({
      timeout: 20_000,
    });
  });
});
