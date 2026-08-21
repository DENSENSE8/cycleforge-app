import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_UNIT } from '@/lib/tenancy/qa-org';

/**
 * Phase 2 — loose UNIT pack placement at Ready-to-Pack DESK/STAGING benches.
 * Sibling of order placement, own ledger (unit_pack_placements), own count.
 *
 * Deterministic against a provisioned QA org:
 *   1. GET /api/units/pack-placement — the four QA benches + a unit-count shape.
 *   2. Place a loose unit by scanned unit-id → it lands on the armed bench →
 *      the bench count increments → a /move shifts it → same-bench move → 409.
 *
 * Never the dogfood tenant (`.claude/rules/verify.md`). Seed + run:
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/unit-pack-placement.spec.ts --project=qa-desktop
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'desktop pack station layout');

type Json = Record<string, unknown>;

async function apiGet(page: Page, url: string): Promise<{ status: number; body: Json }> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  }, url);
}

async function apiPost(page: Page, url: string, payload: Json): Promise<{ status: number; body: Json }> {
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

test.describe('Unit pack placement — loose units on benches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test');
  });

  test('unit pack-placement endpoint returns the seeded QA benches + a counts shape', async ({
    page,
  }) => {
    const { status, body } = await apiGet(page, '/api/units/pack-placement');
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const locations = (body.locations ?? []) as Array<{ barcode: string | null; locationKind: string }>;
    if (locations.length === 0) {
      test.skip(true, 'no packing benches on this tenant — run pnpm provision:qa-org');
    }
    const barcodes = locations.map((l) => String(l.barcode ?? '').toUpperCase());
    expect(barcodes).toContain('QA-PACK-DESK-01');
    for (const l of locations) expect(['DESK', 'STAGING']).toContain(l.locationKind);

    expect(Array.isArray(body.counts)).toBe(true);
    expect(typeof body.totalPlaced).toBe('number');
  });

  test('a loose unit scan places on an armed bench; count increments; /move shifts it', async ({
    page,
  }) => {
    const placement = await apiGet(page, '/api/units/pack-placement');
    const locations = (placement.body.locations ?? []) as Array<{ id: number; locationKind: string }>;
    const desks = locations.filter((l) => l.locationKind === 'DESK');
    if (desks.length < 2) {
      test.skip(true, 'need ≥2 packing desks — run pnpm provision:qa-org');
    }
    const [desk1, desk2] = desks;

    // Place the QA loose unit (by scanned unit-id) on desk 1.
    const place = await apiPost(page, '/api/units/pack-placement/move', {
      unitScan: QA_FIXTURE_UNIT.unitUid,
      locationId: desk1.id,
      idempotencyKey: `pw-unit-place-${Date.now()}`,
    });
    const placeBody = place.body as {
      success?: boolean;
      code?: string;
      placement?: { unitId?: number; locationId?: number };
    };
    if (placeBody.code === 'UNIT_NOT_FOUND') {
      test.skip(true, 'QA loose unit fixture missing — run pnpm provision:qa-org');
    }
    expect(place.status, 'place succeeds').toBe(200);
    expect(placeBody.success).toBe(true);
    expect(placeBody.placement?.locationId, 'placed at desk 1').toBe(desk1.id);
    const unitId = Number(placeBody.placement!.unitId);

    // Desk 1 now holds the staged unit.
    const afterPlace = await apiGet(page, '/api/units/pack-placement');
    const desk1Count = ((afterPlace.body.counts ?? []) as Array<{ locationId: number; count: number }>)
      .find((c) => c.locationId === desk1.id)?.count ?? 0;
    expect(desk1Count, 'desk 1 unit count reflects the placement').toBeGreaterThanOrEqual(1);
    expect(Number(afterPlace.body.totalPlaced)).toBeGreaterThanOrEqual(1);

    // Move it to desk 2.
    const move = await apiPost(page, '/api/units/pack-placement/move', {
      unitId,
      locationId: desk2.id,
    });
    expect(move.status).toBe(200);
    expect((move.body as { placement?: { locationId?: number } }).placement?.locationId).toBe(desk2.id);

    const afterMove = await apiGet(page, '/api/units/pack-placement');
    const desk2Count = ((afterMove.body.counts ?? []) as Array<{ locationId: number; count: number }>)
      .find((c) => c.locationId === desk2.id)?.count ?? 0;
    expect(desk2Count, 'desk 2 unit count reflects the move').toBeGreaterThanOrEqual(1);

    // Moving to the same bench is rejected (SAME_LOCATION → 409).
    const noop = await apiPost(page, '/api/units/pack-placement/move', {
      unitId,
      locationId: desk2.id,
    });
    expect(noop.status, 'moving to the same bench is rejected').toBe(409);
  });

  test('a placed loose unit updates per-bench unit placement counts (P3b)', async ({
    page,
  }) => {
    const placement = await apiGet(page, '/api/units/pack-placement');
    const locations = (placement.body.locations ?? []) as Array<{ id: number; locationKind: string }>;
    const desks = locations.filter((l) => l.locationKind === 'DESK');
    if (desks.length < 1) {
      test.skip(true, 'need ≥1 packing desk — run pnpm provision:qa-org');
    }
    const desk1 = desks[0];

    // Stage the QA loose unit on desk 1 (loose-unit path).
    const place = await apiPost(page, '/api/units/pack-placement/move', {
      unitScan: QA_FIXTURE_UNIT.unitUid,
      locationId: desk1.id,
      idempotencyKey: `pw-unit-kpi-${Date.now()}`,
    });
    const placeBody = place.body as { success?: boolean; code?: string };
    if (placeBody.code === 'UNIT_NOT_FOUND') {
      test.skip(true, 'QA loose unit fixture missing — run pnpm provision:qa-org');
    }
    expect(place.status, 'place succeeds').toBe(200);
    expect(placeBody.success).toBe(true);

    // Fresh mount — per-bench unit counts live on the unit placement API, not
    // a KPI chip row (that display strip was retired; benches filter via the
    // find-field facet / `?packStation=`).
    await page.goto('/test');
    const after = await apiGet(page, '/api/units/pack-placement');
    const visibleCount =
      ((after.body.counts ?? []) as Array<{ locationId: number; count: number }>).find(
        (c) => c.locationId === desk1.id,
      )?.count ?? 0;
    expect(visibleCount, 'desk 1 unit count reflects the placement').toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-testid="unit-bench-strip"]')).toHaveCount(0);
  });
});
