import path from 'path';
import { test, expect } from '@playwright/test';

/**
 * `/shipping/exceptions` — the held-order queue on the ONE outbound grid.
 *
 * Proves the shape the operator asked for on 2026-08-31: the queue IS the house
 * data table, mounted from the orders binding through `useOrdersSpreadsheet`
 * (which is why the rows carry `data-order-row-id` — they are the To-ship
 * desk's own rows), and `?order=` swaps the body to the editor as a PAGE — no
 * right rail, no modal — with pairing and order-field CRUD reachable there.
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

    // The orders binding's own shell under this surface's testid — not a
    // display of its own, and not a bespoke aside.
    const grid = page.getByTestId('order-exceptions-grid-body');
    await expect(grid).toBeVisible({ timeout: 30_000 });
    // The chrome DataTable draws once for every desk.
    await expect(page.getByTestId('data-table-filter')).toBeVisible();

    const rows = grid.locator('[data-order-row-id]');
    const count = await rows.count();
    test.skip(count === 0, 'no caged orders in this environment — nothing to triage');

    // Master/detail: selecting a row binds the editor and the URL.
    await rows.first().click();
    await expect(page).toHaveURL(/[?&]order=\d+/);
    const editor = page.getByTestId('exception-editor');
    await expect(editor).toBeVisible();

    // The record is a PAGE on the same route: the pathname holds and the TABLE
    // is REPLACED, not sat beside. The old assertion here measured a
    // fixed-width detail pane; that pane no longer exists, so it is deleted
    // rather than re-pointed at something else.
    expect(new URL(page.url()).pathname).toBe(PAGE);
    await expect(grid).toHaveCount(0);

    // Order CRUD is present on the page, not behind a modal.
    await expect(editor.getByTestId('exception-item-number')).toBeVisible();
    await expect(editor.getByTestId('exception-sku')).toBeVisible();
    await expect(editor.getByTestId('exception-title')).toBeVisible();
    await expect(editor.getByTestId('exception-tracking')).toBeVisible();
    // No Save button — the editor autosaves; the bottom-right readout is the
    // confirmation that replaced it.
    await expect(editor.getByTestId('exception-save-status')).toBeVisible();
    await expect(editor.getByTestId('exception-save')).toHaveCount(0);

    // Release gates are rendered (never re-derived) with a Release control.
    await expect(editor.getByTestId('exception-release')).toBeVisible();

    // Escape leaves the record and paints the queue again. The editor owns the
    // only Escape listener on this surface; the page adds none of its own.
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/[?&]order=\d+/);
    await expect(page.getByTestId('order-exceptions-grid-body')).toBeVisible();
  });

  test('the CTA opens the full-screen form — rail beside the record', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no QA session');

    await page.goto(PAGE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');

    // Small state is the TABLE ALONE. The rail is not beside it — the stage
    // caps at 1152px and the mounted tracks already come to 880px, so a 22rem
    // rail here would put the grid into horizontal scroll on open.
    const grid = page.getByTestId('order-exceptions-grid-body');
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('exceptions-rail')).toHaveCount(0);

    // The CTA is the way into the form display.
    const cta = page.getByTestId('exceptions-open-form');
    const enabled = await cta.isEnabled();
    test.skip(!enabled, 'no caged orders in this environment — nothing to triage');
    await cta.click();

    // Form display: the rail and the editor arrive together, and the table goes.
    await expect(page).toHaveURL(/[?&]order=\d+/);
    await expect(page.getByTestId('exception-editor')).toBeVisible();
    await expect(page.getByTestId('exceptions-rail')).toBeVisible();
    await expect(grid).toHaveCount(0);

    // Picking another order from the rail keeps the form display.
    const railRows = page.getByTestId('exceptions-rail').locator('[data-order-row-id]');
    if ((await railRows.count()) > 1) {
      await railRows.nth(1).click();
      await expect(page.getByTestId('exception-editor')).toBeVisible();
      await expect(page.getByTestId('exceptions-rail')).toBeVisible();
    }
  });

  test('there is no Actionable | All scope control', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no QA session');

    await page.goto(PAGE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
    await expect(page.getByTestId('order-exceptions-grid-body')).toBeVisible({ timeout: 30_000 });

    // Operator ruling 2026-08-31: `all` redefines this queue into a
    // several-thousand-row backlog sweep rather than narrowing it, so it is a
    // MODE and it is off the surface. `?scope=` is undeclared on the route too.
    await expect(page.getByTestId('exceptions-scope-actionable')).toHaveCount(0);
    await expect(page.getByTestId('exceptions-scope-all')).toHaveCount(0);
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
