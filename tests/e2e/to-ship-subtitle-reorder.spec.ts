import { test, expect, type Locator, type Page } from '@playwright/test';
import { ORDERS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/orders';

/**
 * Under-title facts (qty · condition · listing) reorder by click-and-hold.
 *
 * Headers already drag via HTML5. The subtitle line cannot: nested editors
 * steal the native drag. The display method is pointer tracking
 * (`useSubtitlePointerReorder`). This spec performs a real `locator.dragTo`
 * on To-ship and asserts the painted order changes, then restores the org
 * layout so the write does not leak onto the next run.
 */

const ROUTE = '/shipping/orders';
const TABLE_ID = 'orders';

test.describe('To-ship · under-title fact reorder', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  test('click-and-hold drag reorders qty onto condition under the title', async ({
    page,
  }) => {
      const restored = await readOrgLayout(page);
      await seedProductSubtitleLayout(page);
      try {
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
      const row = page.locator('[data-order-row-id]').first();
      await expect(row, 'To-ship must paint at least one order').toBeVisible({
        timeout: 20_000,
      });

      const line = row.locator('[data-subtitle-reorder="true"]');
      await expect(
        line,
        'the under-title line must be armed for org-wide reorder (manager session)',
      ).toBeVisible({ timeout: 15_000 });

      const qty = row.locator('[data-subtitle-part="orders.qty"]');
      const condition = row.locator('[data-subtitle-part="orders.condition"]');
      await expect(qty).toBeVisible();
      await expect(condition).toBeVisible();

      const before = await subtitleKeys(row);
      expect(before, 'qty and condition must both be bound under the title').toEqual(
        expect.arrayContaining(['orders.qty', 'orders.condition']),
      );
      expect(before[0], 'product default leads with qty so the drop is a real move').toBe(
        'orders.qty',
      );

      if ((await row.getAttribute('aria-selected')) === 'true') {
        await row.getByRole('checkbox').first().click();
      }
      await expect(row).toHaveAttribute('aria-selected', 'false');

      const put = page.waitForResponse(
        (res) =>
          res.url().includes('/api/tables/layouts') &&
          res.request().method() === 'PUT' &&
          res.ok(),
        { timeout: 15_000 },
      );

      await qty.dragTo(condition, { force: true });
      await put;

      await expect
        .poll(() => subtitleKeys(row), { timeout: 10_000 })
        .toEqual(moveOnto(before, 'orders.qty', 'orders.condition'));

      await expect(
        row,
        'a subtitle reorder must not bulk-select the row or open the inspector',
      ).toHaveAttribute('aria-selected', 'false');
    } finally {
      await restoreOrgLayout(page, restored);
    }
  });
});

type OrgLayoutResponse = {
  success?: boolean;
  layout?: unknown;
  canManage?: boolean;
};

async function readOrgLayout(page: Page): Promise<unknown> {
  const res = await page.request.get(`/api/tables/layouts?tableId=${TABLE_ID}`);
  expect(res.ok(), `GET layouts ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as OrgLayoutResponse;
  expect(body.canManage, 'this spec writes the org layout — the session must be a manager').toBe(
    true,
  );
  return body.layout ?? null;
}

async function seedProductSubtitleLayout(page: Page): Promise<void> {
  const res = await page.request.put('/api/tables/layouts', {
    data: { tableId: TABLE_ID, layout: ORDERS_PRODUCT_LAYOUT },
  });
  expect(res.ok(), `seed layouts ${res.status()}`).toBeTruthy();
}

async function restoreOrgLayout(page: Page, layout: unknown): Promise<void> {
  const res = await page.request.put('/api/tables/layouts', {
    data: { tableId: TABLE_ID, layout },
  });
  expect(res.ok(), `restore layouts ${res.status()}`).toBeTruthy();
}

async function subtitleKeys(row: Locator): Promise<string[]> {
  return row.locator('[data-subtitle-part]').evaluateAll((els) =>
    els
      .map((el) => el.getAttribute('data-subtitle-part') || '')
      .filter(Boolean),
  );
}

/** Same splice as `reorderFieldBinding` — land `drag` at `drop`'s index. */
function moveOnto(keys: string[], drag: string, drop: string): string[] {
  const at = keys.indexOf(drag);
  const to = keys.indexOf(drop);
  if (at < 0 || to < 0) return keys;
  const next = [...keys];
  const [moved] = next.splice(at, 1);
  next.splice(to, 0, moved);
  return next;
}
