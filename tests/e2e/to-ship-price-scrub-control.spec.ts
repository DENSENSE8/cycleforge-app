import { test, expect, type Page } from '@playwright/test';
import { ORDERS_PRODUCT_LAYOUT } from '@/lib/tables/field-catalog/orders';
import { SUBTITLE_SCRUB_FINE_GRACE_MS } from '@/components/tables/compound/scrub-number';

/**
 * Control-drag on the under-title price is cents. Releasing Control while the
 * pointer is still displaced must not reread that travel as dollars.
 */

const ROUTE = '/shipping/orders';
const TABLE_ID = 'orders';

test.describe('To-ship · price Control-scrub grace', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Control-scrub is a desktop pointer gesture');

  test('releasing Control under the slider does not jump the price to dollars', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Control-scrub is a desktop pointer gesture');
    const restored = await readOrgLayout(page);
    await seedProductSubtitleLayout(page);
    try {
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
      const row = page.locator('[data-order-row-id]').first();
      await expect(row, 'To-ship must paint at least one order').toBeVisible({
        timeout: 20_000,
      });

      if ((await row.getAttribute('aria-selected')) === 'true') {
        await row.getByRole('checkbox').first().click();
      }
      await expect(row).toHaveAttribute('aria-selected', 'false');

      const host = row.locator('[data-subtitle-scrub]').first();
      await expect(host, 'product layout binds amount as a subtitle scrub').toBeVisible({
        timeout: 15_000,
      });

      const idle = await host.getAttribute('aria-valuetext');
      const box = await host.boundingBox();
      expect(box, 'price host must have a pointer box').toBeTruthy();
      if (!box) return;

      const x = box.x + Math.min(box.width / 2, 24);
      const y = box.y + box.height / 2;

      await page.keyboard.down('Control');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 80, y, { steps: 10 });

      const during = await host.getAttribute('aria-valuetext');
      expect(during, 'Control-drag must paint a live face').toBeTruthy();
      expect(during).not.toBe(idle);

      await page.keyboard.up('Control');
      await expect(host).toHaveAttribute('aria-valuetext', during!);

      await page.waitForTimeout(SUBTITLE_SCRUB_FINE_GRACE_MS + 80);
      await expect(
        host,
        'grace expiry with the pointer still parked must not jump to dollars',
      ).toHaveAttribute('aria-valuetext', during!);

      const idleN = parseFace(idle);
      const afterN = parseFace(during);
      if (idleN != null && afterN != null) {
        expect(
          Math.abs(afterN - idleN),
          'Control-drag of 80px is cents, not eighty dollars',
        ).toBeLessThan(1);
        expect(Math.abs(afterN - (idleN + 80))).toBeGreaterThan(1);
      }

      await host.evaluate((el) => {
        el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
      });
    } finally {
      await restoreOrgLayout(page, restored);
    }
  });
});

function parseFace(text: string | null): number | null {
  const n = Number(String(text ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

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
