import path from 'path';
import { test, expect, type Page } from '@playwright/test';

/**
 * Manual add-order must land on To Ship · Pending **with** imported rows.
 *
 * The identity chip paints last-8 of the marketplace id, so assertions use
 * `data-order-row-id` (db pk) + product title — not the full `CFLOOP-…` string.
 *
 * Queue sort is deadline ASC NULLS LAST. Add-order writes NOW() on the TEST
 * assignment so a brand-new row is in the dated head of the list (not the
 * NULL tail under a virtualized imported backlog).
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

async function pendingGrid(page: Page) {
  return page.locator('[data-testid="pending-grid-body"]').filter({ visible: true }).first();
}

async function paintedRowIds(page: Page): Promise<string[]> {
  const grid = await pendingGrid(page);
  return grid.locator('[data-order-row-id]').evaluateAll((els) =>
    els
      .map((el) => el.getAttribute('data-order-row-id') || '')
      .filter(Boolean),
  );
}

test.describe('add order appears on To Ship pending', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desk rail is a desktop layout');
  test.skip(({ isMobile }) => !!isMobile, 'desk rail is a desktop layout');

  test('manual add-order shows in the pending grid with imported rows', async ({ page, request }) => {
    const probe = await request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no QA session — run pnpm provision:qa-org');

    const stamp = Date.now().toString(36);
    const orderId = `CFLOOP-${stamp}`;
    const tracking = `CFLOOP${stamp}TRACK1`;
    const title = `Tester unit closed loop ${stamp}`;

    await page.goto('/shipping/orders');
    if (/signin|login|account\/sign/i.test(page.url())) {
      test.skip(true, 'no session');
    }
    const grid = await pendingGrid(page);
    await expect(grid).toBeVisible({ timeout: 30_000 });

    const importedIds = await paintedRowIds(page);

    let createdPk = 0;
    let usedUi = false;
    const addBtn = page.getByTestId('outbound-chrome-add');
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      const manual = page.getByText('Add order manually', { exact: true });
      if (await manual.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await manual.click();
      }
      const form = page.getByTestId('shipped-intake-form');
      if (await form.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await form.getByLabel('Order ID').fill(orderId);
        await form.getByRole('textbox', { name: 'Shipping tracking number' }).fill(tracking);
        await form.getByLabel('Product title').fill(title);
        await form.getByRole('radio', { name: 'Used — B' }).click();
        const post = page.waitForResponse(
          (res) => res.url().includes('/api/orders/add') && res.request().method() === 'POST',
          { timeout: 25_000 },
        );
        await page.getByTestId('shipped-intake-submit').click();
        const res = await post;
        expect(res.ok(), `UI POST /api/orders/add ${res.status()}`).toBeTruthy();
        const body = (await res.json()) as { success?: boolean; order?: { id?: number } };
        expect(body.success).toBeTruthy();
        createdPk = Number(body.order?.id);
        usedUi = true;
        await page.evaluate((order) => {
          window.dispatchEvent(new CustomEvent('unshipped-order-added', { detail: order }));
        }, body.order);
      }
    }

    if (!createdPk) {
      const created = await page.request.post('/api/orders/add', {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `e2e-${stamp}`,
        },
        data: {
          orderId,
          productTitle: title,
          shippingTrackingNumber: tracking,
          shippingTrackingNumbers: [tracking],
          accountSource: 'Manual',
          typeSlug: 'PO',
          condition: 'USED_B',
          idempotencyKey: `e2e-${stamp}`,
        },
      });
      expect(
        created.ok(),
        `POST /api/orders/add ${created.status()}: ${await created.text()}`,
      ).toBeTruthy();
      const body = (await created.json()) as { success?: boolean; order?: { id?: number } };
      expect(body.success).toBeTruthy();
      createdPk = Number(body.order?.id);
      await page.goto('/shipping/orders');
      await expect(await pendingGrid(page)).toBeVisible({ timeout: 30_000 });
    }

    expect(createdPk).toBeGreaterThan(0);

    const listed = await request.get(
      `/api/orders?q=${encodeURIComponent(orderId)}&fulfillmentScope=true`,
    );
    expect(listed.ok()).toBeTruthy();
    const payload = (await listed.json()) as { orders?: Array<{ order_id?: string; id?: number }> };
    expect(
      (payload.orders ?? []).some((row) => String(row.order_id) === orderId),
      'add-order must be in fulfillmentScope /api/orders',
    ).toBeTruthy();

    const board = await request.get('/api/orders?fulfillmentScope=true&listShape=queue&limit=20');
    expect(board.ok()).toBeTruthy();
    const boardPayload = (await board.json()) as { orders?: Array<{ id?: number; order_id?: string }> };
    const boardIds = (boardPayload.orders ?? []).map((row) => Number(row.id));
    expect(
      boardIds.includes(createdPk),
      `add-order pk ${createdPk} must be in the first page of the pending queue (got ${boardIds.slice(0, 8).join(',')})`,
    ).toBeTruthy();

    // Stay on the live desk. A second `goto` can reuse a stale RSC seed
    // (older pks like 9425) while `/api/orders` already has the new row.
    const row = page.locator(`[data-order-row-id="${createdPk}"]`);
    await expect(row, `pending row pk ${createdPk} (ui=${usedUi})`).toBeVisible({ timeout: 20_000 });
    await expect(row).toHaveAttribute('data-marketplace-order-id', orderId);
    await expect(row.getByText(title, { exact: false }).first()).toBeVisible();

    if (importedIds.length > 0) {
      const still = importedIds.filter((id) => id !== String(createdPk)).slice(0, 3);
      for (const id of still) {
        await expect(
          page.locator(`[data-order-row-id="${id}"]`),
          `imported row ${id} must stay on Pending with the tester unit`,
        ).toBeVisible();
      }
      expect((await paintedRowIds(page)).length).toBeGreaterThan(1);
    }
  });
});
