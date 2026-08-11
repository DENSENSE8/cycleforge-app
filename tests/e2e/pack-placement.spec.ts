import { test, expect, type Page } from '@playwright/test';
import {
  QA_FIXTURE_TRACKING_PENDING,
  QA_FIXTURE_TRACKING_PENDING_SECOND,
  QA_FIXTURE_TRACKING_PENDING_THIRD,
} from '@/lib/tenancy/qa-org';

/**
 * Ready-to-Pack pack-placement — packing DESK/STAGING benches on `locations`,
 * current place in `order_pack_placements`, counts on both desks (Ready-to-Pack
 * KPI) and To-ship ("At stations").
 *
 * Deterministic against a provisioned QA org:
 *   1. GET /api/orders/pack-placement — the four QA benches + a counts shape.
 *   2. GET /api/orders/queue-counts — carries the packPlacement block.
 *   3. /test — Ready-to-Pack KPI renders per-station tiles (Staging is a stable
 *      QA label).
 *   4. /dashboard?unshipped — Outbound KPI (which hosts "At stations") mounts.
 *
 * Opportunistic full flow (asserted when the QA data is eligible, skipped with
 * guidance otherwise — the pending fixtures must be labeled + unshipped for a
 * TRACKING scan to place them):
 *   5. Arm a bench via packLocationId on a tech TRACKING scan → the order is
 *      placed → the desk count increments → a /move shifts it to another bench.
 *
 * Never the dogfood tenant (`.claude/rules/verify.md`). Seed + run:
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/pack-placement.spec.ts --project=qa-desktop
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'desktop pack station layout');

type Json = Record<string, unknown>;

/** Same-origin authed GET from the page context (carries the qa-admin session). */
async function apiGet(page: Page, url: string): Promise<{ status: number; body: Json }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, url);
}

/** Same-origin authed POST from the page context. */
async function apiPost(
  page: Page,
  url: string,
  payload: Json,
): Promise<{ status: number; body: Json }> {
  return page.evaluate(
    async ({ u, p }) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, body };
    },
    { u: url, p: payload },
  );
}

test.describe('Pack placement — Ready-to-Pack benches + counts', () => {
  test.beforeEach(async ({ page }) => {
    // Any same-origin page establishes the fetch base + session cookie.
    await page.goto('/test');
  });

  test('pack-placement endpoint returns the seeded QA benches + a counts shape', async ({
    page,
  }) => {
    const { status, body } = await apiGet(page, '/api/orders/pack-placement');
    expect(status, 'pack-placement is readable with orders.view').toBe(200);
    expect(body.success).toBe(true);

    const locations = (body.locations ?? []) as Array<{
      barcode: string | null;
      locationKind: string;
    }>;
    if (locations.length === 0) {
      test.skip(true, 'no packing benches on this tenant — run pnpm provision:qa-org');
    }

    const barcodes = locations.map((l) => String(l.barcode ?? '').toUpperCase());
    expect(barcodes, 'QA Pack Desk 1 is seeded').toContain('QA-PACK-DESK-01');
    expect(barcodes.some((b) => b === 'QA-PACK-STAGING'), 'QA staging is seeded').toBe(true);
    // Only DESK / STAGING are placeable — never a ROOM or BIN.
    for (const l of locations) {
      expect(['DESK', 'STAGING']).toContain(l.locationKind);
    }

    expect(Array.isArray(body.counts), 'counts is an array').toBe(true);
    expect(typeof body.totalPlaced, 'totalPlaced is a number').toBe('number');
  });

  test('queue-counts carries the packPlacement block (To-ship "At stations")', async ({
    page,
  }) => {
    const { status, body } = await apiGet(page, '/api/orders/queue-counts');
    expect(status).toBe(200);
    const pack = (body.packPlacement ?? {}) as { counts?: unknown; totalPlaced?: unknown };
    expect(Array.isArray(pack.counts), 'packPlacement.counts is an array').toBe(true);
    expect(typeof pack.totalPlaced, 'packPlacement.totalPlaced is a number').toBe('number');
  });

  test('Ready-to-Pack KPI renders per-station tiles', async ({ page }) => {
    await page.goto('/test');
    const kpi = page.locator('section[aria-label="Ready to Pack attention"]').first();
    await expect(kpi).toBeVisible({ timeout: 20_000 });

    // Station tiles come from the placement query (always the seeded benches),
    // so "Staging" is a stable label unless the strip collapses to All clear.
    const staging = kpi.getByText('Staging', { exact: true }).first();
    const hasStaging = await staging
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasStaging) {
      test.skip(true, 'Ready-to-Pack strip has no station tiles — run pnpm provision:qa-org');
    }
    await expect(staging).toBeVisible();
    await page.screenshot({ path: 'test-results/pack-placement-ready-kpi.png' });
  });

  test('To-ship Outbound KPI (host of "At stations") mounts', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const kpi = page.locator('section[aria-label="Outbound attention"]').first();
    await expect(kpi).toBeVisible({ timeout: 20_000 });
  });

  test('To-ship per-bench ORDER chips render and filter the board (P3d)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const strip = page.locator('[data-testid="order-bench-strip"]').first();
    await expect(strip, 'per-bench order strip renders').toBeVisible({ timeout: 20_000 });

    // Separate from the loose-UNIT strip on Ready-to-Pack: the two ledgers keep
    // their own counts, so the To-ship row is labelled for orders.
    await expect(strip).toHaveAttribute('aria-label', 'Orders at bench');

    const placement = await apiGet(page, '/api/orders/pack-placement');
    const desks = ((placement.body.locations ?? []) as Array<{ id: number; locationKind: string }>)
      .filter((l) => l.locationKind === 'DESK');
    if (desks.length < 1) {
      test.skip(true, 'need ≥1 packing desk — run pnpm provision:qa-org');
    }
    const chip = strip.locator(`[data-testid="order-bench-${desks[0].id}"]`);
    await expect(chip, 'desk chip is present').toBeVisible();
    await page.screenshot({ path: 'test-results/pack-placement-toship-bench-chips.png' });
    await expect(chip, 'a bench chip is a filter toggle, not a readout').toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Clicking filters the board to that bench (`?packStation=`), and clears the
    // aggregate `?packPlaced=` — "placed anywhere" and "placed HERE" are one question.
    await chip.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('packStation'), {
        message: 'bench click writes ?packStation=',
        timeout: 10_000,
      })
      .toBe(String(desks[0].id));
    expect(new URL(page.url()).searchParams.get('packPlaced')).toBeNull();
    await expect(chip, 'the filtered bench reads as pressed').toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Clicking the same bench again clears the filter rather than re-applying it.
    await chip.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('packStation'), {
        message: 'clicking the armed bench again clears the filter',
        timeout: 10_000,
      })
      .toBeNull();
  });

  test('the Station column is opt-in, and paints a bench chip once enabled', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    await expect(page.locator('[role="columnheader"]').first()).toBeVisible({ timeout: 25_000 });

    // `tier: 'optional'` — off by default, so the default To-ship lane is
    // unchanged for staff who never opt in.
    const defaultCols = await page.evaluate(() =>
      [...document.querySelectorAll('[role="columnheader"]')].map((c) => c.getAttribute('data-col')),
    );
    expect(defaultCols, 'Station is not on the default lane').not.toContain('packStation');

    // Opt in through the same staff delta the ▦ column-display panel writes.
    const put = await apiPost(page, '/api/staff-preferences', {
      tableColumns: { orders: { shown: ['packStation'] } },
    });
    expect(put.status, 'staff column delta saved').toBe(200);

    // Stage a board-visible order (tracked + not already placed) so the cell
    // has a bench to name.
    const placement = await apiGet(page, '/api/orders/pack-placement');
    const desk = ((placement.body.locations ?? []) as Array<{ id: number; locationKind: string }>)
      .find((l) => l.locationKind === 'DESK');
    if (!desk) {
      test.skip(true, 'need a packing desk — run pnpm provision:qa-org');
      return;
    }

    const staged = await page.evaluate(async (deskId: number) => {
      const api = await (
        await fetch('/api/orders?fulfillmentScope=true&listShape=queue&limit=200')
      ).json();
      const cand = (api.orders || []).find(
        (r: Record<string, unknown>) =>
          r.pack_location_id == null && (r.tracking_number || r.shipping_tracking_number),
      );
      if (!cand) return { skipped: true as const };
      const res = await fetch('/api/orders/pack-placement/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: cand.id,
          locationId: deskId,
          idempotencyKey: `pw-station-col-${Date.now()}`,
        }),
      });
      return { skipped: false as const, status: res.status };
    }, desk.id);
    if (staged.skipped) test.skip(true, 'no unstaged tracked order on the board');
    expect(staged.status, 'order staged at the bench').toBe(200);

    await page.reload();
    await expect(page.locator('[role="columnheader"]').first()).toBeVisible({ timeout: 25_000 });
    const withCol = await page.evaluate(() =>
      [...document.querySelectorAll('[role="columnheader"]')].map((c) => c.getAttribute('data-col')),
    );
    expect(withCol, 'Station appears once opted in').toContain('packStation');

    // The staged row names its bench through the SoT label (`Station 1`), and
    // every other row shows the quiet em dash — never a blank cell.
    const cells = page.locator('[data-col="packStation"]');
    await expect
      .poll(
        async () =>
          (await cells.allTextContents()).slice(1).filter((t) => t.trim() && !t.includes('—')).length,
        { message: 'a staged row paints a bench chip', timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/toship-station-column.png' });
  });

  test('a TRACKING scan places an order at an armed bench; counts increment; /move shifts it', async ({
    page,
  }) => {
    const placement = await apiGet(page, '/api/orders/pack-placement');
    const locations = (placement.body.locations ?? []) as Array<{
      id: number;
      barcode: string | null;
      locationKind: string;
    }>;
    const desks = locations.filter((l) => l.locationKind === 'DESK');
    if (desks.length < 2) {
      test.skip(true, 'need ≥2 packing desks — run pnpm provision:qa-org');
    }
    const [desk1, desk2] = desks;

    // Try each pending fixture tracking; the first that is prepack-eligible places.
    const candidates = [
      QA_FIXTURE_TRACKING_PENDING,
      QA_FIXTURE_TRACKING_PENDING_SECOND,
      QA_FIXTURE_TRACKING_PENDING_THIRD,
    ];
    let placedOrderId: number | null = null;
    for (const tracking of candidates) {
      const res = await apiPost(page, '/api/tech/scan', {
        value: tracking,
        packLocationId: desk1.id,
        idempotencyKey: `pw-pack-${tracking}-${Date.now()}`,
      });
      const body = res.body as {
        success?: boolean;
        packPlacement?: { orderId?: number; locationId?: number };
        code?: string;
      };
      // Sending a packLocationId must never trip the arm gate — that would be a bug.
      expect(body.code, 'armed scan is never PACK_STATION_REQUIRED').not.toBe(
        'PACK_STATION_REQUIRED',
      );
      if (body.success && body.packPlacement?.orderId) {
        expect(body.packPlacement.locationId, 'placed at the armed bench').toBe(desk1.id);
        placedOrderId = Number(body.packPlacement.orderId);
        break;
      }
    }

    if (placedOrderId == null) {
      test.skip(
        true,
        'no pending fixture order was prepack-eligible to place — run pnpm provision:qa-org',
      );
    }

    // Desk 1 now holds at least the order we just placed.
    const afterPlace = await apiGet(page, '/api/orders/pack-placement');
    const desk1Count = ((afterPlace.body.counts ?? []) as Array<{ locationId: number; count: number }>)
      .find((c) => c.locationId === desk1.id)?.count ?? 0;
    expect(desk1Count, 'desk 1 count reflects the placement').toBeGreaterThanOrEqual(1);
    expect(
      Number(afterPlace.body.totalPlaced),
      'total placed reflects the placement',
    ).toBeGreaterThanOrEqual(1);

    // Move it to desk 2 — placement moves, lifecycle (TESTED) does not.
    const move = await apiPost(page, '/api/orders/pack-placement/move', {
      orderId: placedOrderId,
      locationId: desk2.id,
    });
    expect(move.status, 'move succeeds').toBe(200);
    const moveBody = move.body as { success?: boolean; placement?: { locationId?: number } };
    expect(moveBody.success).toBe(true);
    expect(moveBody.placement?.locationId, 'moved to desk 2').toBe(desk2.id);

    const afterMove = await apiGet(page, '/api/orders/pack-placement');
    const desk2Count = ((afterMove.body.counts ?? []) as Array<{ locationId: number; count: number }>)
      .find((c) => c.locationId === desk2.id)?.count ?? 0;
    expect(desk2Count, 'desk 2 count reflects the move').toBeGreaterThanOrEqual(1);

    // Re-placing at the same bench via /move is a no-op (SAME_LOCATION → 409).
    const noop = await apiPost(page, '/api/orders/pack-placement/move', {
      orderId: placedOrderId,
      locationId: desk2.id,
    });
    expect(noop.status, 'moving to the same bench is rejected').toBe(409);
  });
});
