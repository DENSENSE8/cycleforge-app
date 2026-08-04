import { test, expect, type APIRequestContext } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * Move-photos "Recent cartons" titles — same product ladder as the Unboxed
 * sidebar (catalog → Zoho item → item_name → sku), not a wall of "Unfound PO"
 * from updated_at triage stubs.
 *
 * Asserts:
 *   (1) Empty browse API titles match Unboxed `view=unbox_opened` product titles
 *       for overlapping cartons;
 *   (2) Browse surfaces at least one real product title when the Unboxed rail has
 *       one (not updated_at stub flood);
 *   (3) UI Recent cartons rows paint those titles when Move photos opens.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

function railProductTitle(row: {
  catalog_product_title?: string | null;
  zoho_item_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
  zoho_item_id?: string | null;
}): string {
  const pick = (v?: string | null) => {
    const t = String(v || '').trim();
    if (!t || t === 'Unfound PO') return '';
    return t;
  };
  return (
    pick(row.catalog_product_title) ||
    pick(row.zoho_item_title) ||
    pick(row.item_name) ||
    pick(row.sku) ||
    pick(row.zoho_item_id) ||
    'Unfound PO'
  );
}

async function hasQaSession(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get('/api/receiving-lines?view=recent&limit=1');
  return probe.ok();
}

test.describe('Move-photos Recent cartons — Unboxed product titles', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Unbox workbench is desktop layout');
  test.skip(({ isMobile }) => !!isMobile, 'Unbox workbench is desktop-only');

  let pool: Pool;
  let cartonId: number | null = null;

  test.beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const row = await pool.query<{ id: string }>(
      `SELECT id FROM receiving_carton
        WHERE organization_id = $1 AND zoho_purchaseorder_id = $2
        ORDER BY id DESC LIMIT 1`,
      [resolveQaOrgId(), QA_FIXTURE_PO_ID],
    );
    cartonId = row.rows[0] ? Number(row.rows[0].id) : null;
  });

  test.afterAll(async () => {
    await pool?.end();
  });

  test('browse API titles match Unboxed rail product ladder', async ({ request }) => {
    test.skip(
      !(await hasQaSession(request)),
      'no QA session — tests/.auth/qa-admin.json empty (run pnpm provision:qa-org)',
    );

    const railRes = await request.get(
      '/api/receiving-lines?view=unbox_opened&limit=40&offset=0',
    );
    expect(railRes.ok()).toBeTruthy();
    const railBody = (await railRes.json()) as {
      receiving_lines?: Array<{
        receiving_id: number | null;
        catalog_product_title?: string | null;
        zoho_item_title?: string | null;
        item_name?: string | null;
        sku?: string | null;
        zoho_item_id?: string | null;
      }>;
    };
    const railByCarton = new Map<number, string>();
    for (const row of railBody.receiving_lines ?? []) {
      const rid = row.receiving_id;
      if (rid == null || !Number.isFinite(rid) || railByCarton.has(rid)) continue;
      railByCarton.set(rid, railProductTitle(row));
    }

    const moveRes = await request.get('/api/receiving/photo-move-targets?limit=25');
    expect(moveRes.ok()).toBeTruthy();
    const moveBody = (await moveRes.json()) as {
      targets?: Array<{ receiving_id: number; title: string }>;
    };
    const targets = moveBody.targets ?? [];
    expect(targets.length).toBeGreaterThan(0);

    const railProductTitles = [...railByCarton.values()].filter((t) => t !== 'Unfound PO');
    test.skip(
      railProductTitles.length === 0,
      'QA Unboxed rail has no product-titled cartons yet',
    );

    // Browse must surface product titles (Unboxed membership), not only stubs.
    const moveProductTitles = targets
      .map((t) => String(t.title || '').trim())
      .filter((t) => t && t !== 'Unfound PO');
    expect(
      moveProductTitles.length,
      'Recent cartons browse should include product titles like the Unboxed sidebar',
    ).toBeGreaterThan(0);

    for (const t of targets) {
      const railTitle = railByCarton.get(t.receiving_id);
      if (!railTitle || railTitle === 'Unfound PO') continue;
      expect(
        String(t.title || '').trim(),
        `carton R-${t.receiving_id} picker title should match Unboxed product title`,
      ).toBe(railTitle);
    }
  });

  test('Move photos UI Recent cartons shows item names', async ({ page, request }) => {
    test.skip(
      !(await hasQaSession(request)),
      'no QA session — tests/.auth/qa-admin.json empty (run pnpm provision:qa-org)',
    );
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');

    const moveRes = await request.get(
      `/api/receiving/photo-move-targets?limit=25&exclude=${cartonId}`,
    );
    expect(moveRes.ok()).toBeTruthy();
    const moveBody = (await moveRes.json()) as {
      targets?: Array<{ receiving_id: number; title: string; photo_count?: number }>;
    };
    const expectedProduct = (moveBody.targets ?? []).find(
      (t) => String(t.title || '').trim() && t.title !== 'Unfound PO',
    );
    test.skip(
      !expectedProduct,
      'no product-titled move target in QA browse — seed an Unboxed product carton',
    );

    // Prefer a carton that already has photos so the Move toolbar action enables.
    const photoProbe = await pool.query<{ receiving_id: number }>(
      `SELECT r.id AS receiving_id
         FROM receiving_carton r
         JOIN photo_entity_links l
           ON l.organization_id = r.organization_id
          AND (
            (l.entity_type = 'RECEIVING' AND l.entity_id = r.id)
            OR (l.entity_type = 'RECEIVING_LINE' AND EXISTS (
                  SELECT 1 FROM receiving_line rl
                   WHERE rl.id = l.entity_id
                     AND rl.receiving_id = r.id
                     AND rl.organization_id = r.organization_id
                ))
          )
        WHERE r.organization_id = $1
          AND r.id = $2
        LIMIT 1`,
      [resolveQaOrgId(), cartonId],
    );
    test.skip(
      photoProbe.rows.length === 0,
      'QA fixture carton has no photos — Move toolbar action stays disabled',
    );

    await page.goto(`/unbox?openReceivingId=${cartonId}`);

    const photoPill = page.getByRole('button', { name: /photo|send to phone|upload/i }).first();
    await expect(photoPill).toBeVisible({ timeout: 20_000 });
    await photoPill.hover();
    const toolbar = page.getByTestId('photo-launcher-toolbar');
    await expect(toolbar).toBeVisible({ timeout: 10_000 });

    const moveBtn = toolbar.getByRole('button', { name: /^Move$/i });
    await expect(moveBtn).toBeEnabled({ timeout: 5_000 });
    await moveBtn.click();

    const toolPush = page.getByTestId('receiving-tool-push');
    await expect(toolPush).toBeVisible({ timeout: 10_000 });
    await expect(toolPush).toHaveAttribute('data-tool', 'move-photos');
    await expect(page.getByTestId('photo-move-recent-eyebrow')).toBeVisible({
      timeout: 10_000,
    });

    const rows = page.getByTestId('photo-move-target-row');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    const titles = await rows.evaluateAll((els) =>
      els.map((el) => (el.getAttribute('data-title') || '').trim()),
    );
    expect(
      titles.some((t) => t && t !== 'Unfound PO'),
      `Recent cartons should show item names; got: ${titles.slice(0, 8).join(' | ')}`,
    ).toBeTruthy();

    await expect(
      rows.filter({ hasText: expectedProduct!.title }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
