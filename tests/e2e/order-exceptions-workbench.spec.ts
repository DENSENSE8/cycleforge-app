import path from 'path';
import { test, expect } from '@playwright/test';

/**
 * `/shipping/exceptions` — the full-width order-exception workbench.
 *
 * Proves the shape the operator asked for: a queue on the left, the whole
 * record on the right, at full page width (NOT the fixed-width desk stage),
 * with pairing and order-field CRUD reachable without leaving the page.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const PAGE = '/shipping/exceptions';

test.describe('Order exceptions workbench', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop workbench');
  test.skip(({ isMobile }) => !!isMobile, 'desktop workbench');

  test('queue + editor render, and the editor exposes pairing and order CRUD', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no QA session — run pnpm provision:qa-org');

    await page.goto(PAGE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');

    const queue = page.getByTestId('exceptions-queue');
    await expect(queue).toBeVisible({ timeout: 30_000 });

    const rows = queue.locator('[data-order-row-id]');
    const count = await rows.count();
    test.skip(count === 0, 'no caged orders in this environment — nothing to triage');

    // Master/detail: selecting a row binds the editor and the URL.
    await rows.first().click();
    await expect(page).toHaveURL(/[?&]order=\d+/);
    const editor = page.getByTestId('exception-editor');
    await expect(editor).toBeVisible();

    // Full-width: the detail pane is materially wider than the 46rem overlay
    // that made this job painful. Guards against it being re-parented into the
    // fixed-width desk stage.
    const detail = page.getByTestId('exceptions-detail');
    const box = await detail.boundingBox();
    expect(box, 'detail pane must have layout').not.toBeNull();
    expect(box!.width).toBeGreaterThan(640);

    // Order CRUD is present on the page, not behind a modal.
    await expect(editor.getByTestId('exception-item-number')).toBeVisible();
    await expect(editor.getByTestId('exception-sku')).toBeVisible();
    await expect(editor.getByTestId('exception-title')).toBeVisible();
    await expect(editor.getByTestId('exception-tracking')).toBeVisible();
    await expect(editor.getByTestId('exception-save')).toBeVisible();

    // Release gates are rendered (never re-derived) with a Release control.
    await expect(editor.getByTestId('exception-release')).toBeVisible();
  });

  test('an unpaired row offers both link-existing and create-new', async ({ page }) => {
    const probe = await page.request.get('/api/orders/exceptions?scope=actionable');
    test.skip(!probe.ok(), 'no QA session');
    const body = (await probe.json()) as {
      exceptions?: Array<{ id: number; skuCatalogId: number | null }>;
    };
    const unpaired = (body.exceptions ?? []).find((e) => e.skuCatalogId == null);
    test.skip(!unpaired, 'no unpaired caged order fixture');

    await page.goto(`${PAGE}?order=${unpaired!.id}`);
    const editor = page.getByTestId('exception-editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });

    // Both routes out of "unpaired" are on screen at once.
    await expect(editor.getByTestId('exception-catalog-search')).toBeVisible();
    await expect(editor.getByTestId('exception-create-sku')).toBeVisible();
  });
});
