import { test, expect, type APIRequestContext } from '@playwright/test';
import path from 'path';
import { Pool } from 'pg';
import { resolveQaOrgId, QA_FIXTURE_PO_ID } from '@/lib/tenancy/qa-org';

/**
 * Unbox tool push — Move photos / Send photo note / Audit open as a station
 * right-edge push column (Claim/Ticket family), not a centered RightPaneOverlay
 * with viewport scrim.
 *
 * Asserts:
 *   (1) Ticket (send photos) from the photo toolbar opens `[data-testid=receiving-tool-push]`;
 *   (2) no panel/detail-stack backdrop;
 *   (3) body scroll not locked;
 *   (4) opening Claim clears the tool push (one right-edge secondary).
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const BACKDROP_SELECTOR = '[class*="z-panelBackdrop"], [class*="z-detailStackBackdrop"]';

async function hasQaSession(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get('/api/receiving-lines?view=recent&limit=1');
  return probe.ok();
}

test.describe('Unbox tool push — non-modal right column', () => {
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

  test('Send photos opens as right push without scrim; Claim replaces it', async ({
    page,
    request,
  }) => {
    test.skip(
      !(await hasQaSession(request)),
      'no QA session — tests/.auth/qa-admin.json empty (run pnpm provision:qa-org)',
    );
    test.skip(!cartonId, 'QA receiving fixture missing — run pnpm provision:qa-org');

    await page.goto(`/unbox?openReceivingId=${cartonId}`);

    // Station identity chrome (photo pill lives here).
    const photoPill = page.getByRole('button', { name: /photo|send to phone|upload/i }).first();
    await expect(photoPill).toBeVisible({ timeout: 20_000 });

    // Hover opens the photo action toolbar (Ticket does not need existing photos).
    await photoPill.hover();
    const toolbar = page.getByTestId('photo-launcher-toolbar');
    await expect(toolbar).toBeVisible({ timeout: 10_000 });

    await toolbar.getByRole('button', { name: /^Ticket$/i }).click();

    const toolPush = page.getByTestId('receiving-tool-push');
    await expect(toolPush).toBeVisible({ timeout: 10_000 });
    await expect(toolPush).toHaveAttribute('data-tool', 'photo-note');
    await expect(toolPush).toHaveAttribute('role', 'region');

    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .not.toBe('hidden');

    // Claim takes the same right-edge slot — tool push must go away.
    const claimBtn = page.getByRole('button', { name: /^Claim$/i });
    await expect(claimBtn).toBeVisible();
    await claimBtn.click();

    await expect(page.getByTestId('receiving-claim-push')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('receiving-tool-push')).toHaveCount(0);
  });
});
