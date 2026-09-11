import { test, expect } from '@playwright/test';

/**
 * Mobile homepage assigned-orders inset group + `/m/work` phone queue.
 *
 * Home keeps the inset preview card. `/m/work` is All / Assigned / Unassigned
 * tabs, slot-style rows (title · qty / condition / note · picker / packer),
 * and a far-right Ship CTA. Identity numbers live on the row sheet.
 *
 * Chrome is asserted independently of `GET /api/work-orders/mine?list=1` —
 * that list fetch can take seconds (it fans out every work-order queue), and
 * the header + chevron must paint without it.
 */

test.describe('mobile home assigned orders inset group', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Orders header, view-all action, and /m/work door', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [] }),
      }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] }),
      }),
    );

    await page.goto('/m/home');

    const group = page.getByTestId('assigned-orders-group');
    await expect(group).toBeVisible();
    await expect(group.getByText('Orders')).toBeVisible();
    await expect(page.getByTestId('mobile-page-title')).toHaveText('Home');
    await expect(page.getByRole('button', { name: 'View all orders' })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Open menu' });
    const scan = page.getByRole('button', { name: 'Go to scan' });
    await expect(menu).toBeVisible();
    await expect(scan).toBeVisible();
    await expect(menu).toHaveCSS('border-radius', '12px');
    await expect(scan).toHaveCSS('border-radius', '12px');

    await page.getByTestId('view-all-orders-empty').click();
    await expect(page).toHaveURL(/\/m\/work/);
    await expect(page.getByTestId('mobile-page-title')).toHaveText('Orders');
    const tabs = page.getByTestId('to-ship-tablist');
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'All', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Assigned', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Unassigned', exact: true })).toBeVisible();
    await expect(page.getByTestId('to-ship-sort')).toBeVisible();
    await expect(page.getByTestId('to-ship-search')).toBeVisible();
  });

  test('empty assigned card opens the all-orders queue', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [] }),
      }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] }),
      }),
    );

    await page.goto('/m/home');
    await expect(page.getByTestId('view-all-orders-empty')).toBeVisible();
    await page.getByTestId('view-all-orders-empty').click();
    await expect(page).toHaveURL(/\/m\/work\?tab=all/);
    await expect(page.getByTestId('to-ship-queue')).toBeVisible();
    await expect(page.getByTestId('to-ship-tablist')).toBeVisible();
    await expect(page.getByTestId('mobile-page-title')).toHaveText('Orders');
  });

  test('queue rows show slot facts; sheet holds identity numbers', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [] }),
      }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 99,
              order_id: '12-345678901234',
              product_title: 'Test Bike',
              condition: 'USED_A',
              quantity: '2',
              sale_amount: '49.99',
              currency: 'USD',
              notes: 'Hold for photo',
              sku: 'SKU-1',
              serial_number: '',
              ship_by_date: '2026-09-02',
              shipping_tracking_number: '1Z999AA10123456784',
              tester_id: 4,
              tester_name: 'Alex Pick',
              tester_color_hex: '#e11d48',
              tested_by: null,
              test_date_time: null,
              packer_id: 3,
              packer_name: 'Pat Pack',
              packer_color_hex: '#2563eb',
              packed_by_name: 'Pat Pack',
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '123456789012',
              is_out_of_stock: false,
            },
            {
              id: 100,
              order_id: '98-000000000001',
              product_title: 'Zebra Frame',
              condition: 'USED_B',
              quantity: '1',
              notes: '',
              sku: 'SKU-Z',
              serial_number: '',
              ship_by_date: '2026-09-03',
              shipping_tracking_number: '',
              tester_id: null,
              tester_name: null,
              tested_by: null,
              test_date_time: null,
              packer_id: null,
              packed_by_name: null,
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '111',
              is_out_of_stock: false,
            },
          ],
        }),
      }),
    );

    await page.route('**/api/orders/99/documents**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          documents: [
            {
              id: 1,
              documentType: 'shipping_label',
              data: { url: 'https://example.test/label.pdf' },
              links: [],
              createdAt: '',
              updatedAt: '',
            },
          ],
          nasBaseUrl: '',
          nasFolder: '',
        }),
      }),
    );

    await page.goto('/m/work?tab=all');
    await expect(page.getByTestId('to-ship-queue')).toBeVisible();
    await expect(page.getByTestId('to-ship-sort')).toBeVisible();
    await expect(page.getByTestId('to-ship-search')).toBeVisible();
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.locator('[data-item-record-thumb]').first()).toBeVisible();
    await expect(page.getByTestId('to-ship-qty').first()).toHaveText('2');
    await expect(page.getByTestId('to-ship-price').first()).toHaveText('$49.99');
    await expect(page.getByTestId('to-ship-condition').first()).toHaveText('A');
    await expect(page.getByTestId('to-ship-picker')).toHaveCount(0);
    await expect(page.getByTestId('to-ship-packer')).toHaveCount(0);
    await expect(page.getByTestId('to-ship-queue').getByRole('button', { name: 'Ship', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('to-ship-listing').first()).toBeVisible();
    await expect(page.getByTestId('to-ship-more')).toHaveCount(0);
    await expect(page.getByTestId('to-ship-queue').getByRole('button', { name: 'Out of stock' })).toHaveCount(0);
    await expect(page.getByText('78901234')).toHaveCount(0);
    await expect(page.getByText(/9\/2\/26/)).toHaveCount(0);
    await expect(page.getByText('SKU-1')).toHaveCount(0);

    await page.getByText('Test Bike').click();
    await expect(page.getByTestId('to-ship-sheet')).toBeVisible();
    await expect(page.getByText('78901234')).toBeVisible();
    await expect(page.getByText(/9\/2\/26/)).toBeVisible();
    await expect(page.getByTestId('to-ship-sheet-assignees')).toContainText('Alex Pick');
    await expect(page.getByTestId('to-ship-sheet-assignees')).toContainText('Pat Pack');
    await expect(page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Pass pick' })).toBeVisible();
    await expect(page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Listing' })).toBeVisible();
    await expect(page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Listing' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shipping label' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Internal documents' }).locator('svg')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Order details' }).locator('svg')).toBeVisible();
    await expect(page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Out of stock' }).locator('svg')).toBeVisible();
    await expect(page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Ship', exact: true }).locator('svg')).toBeVisible();
  });

  test('search finds the order; Title A–Z sorts; out of stock disables Ship', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [] }),
      }),
    );
    const oosIds = new Set<number>();
    await page.route('**/api/orders?**', (route) => {
      const orders = [
        {
          id: 99,
          order_id: '12-345678901234',
          product_title: 'Test Bike',
          condition: 'USED_A',
          quantity: '2',
          notes: 'Hold for photo',
          sku: 'SKU-1',
          serial_number: '',
          ship_by_date: '2026-09-02',
          shipping_tracking_number: '1Z999AA10123456784',
          tester_id: 4,
          tester_name: 'Alex Pick',
          tested_by: null,
          test_date_time: null,
          packer_id: 3,
          packed_by_name: 'Pat Pack',
          packed_by: null,
          packed_at: null,
          packer_photos_url: null,
          tracking_type: null,
          account_source: 'ebay',
          item_number: '123456789012',
          is_out_of_stock: oosIds.has(99),
        },
        {
          id: 100,
          order_id: '98-000000000001',
          product_title: 'Zebra Frame',
          condition: 'USED_B',
          quantity: '1',
          notes: '',
          sku: 'SKU-Z',
          serial_number: '',
          ship_by_date: '2026-09-03',
          shipping_tracking_number: '',
          tester_id: null,
          tester_name: null,
          tested_by: null,
          test_date_time: null,
          packer_id: null,
          packed_by_name: null,
          packed_by: null,
          packed_at: null,
          packer_photos_url: null,
          tracking_type: null,
          account_source: 'ebay',
          item_number: '111',
          is_out_of_stock: oosIds.has(100),
        },
      ];
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders }),
      });
    });

    const assignPosts: unknown[] = [];
    await page.route('**/api/orders/assign**', async (route) => {
      const body = route.request().postDataJSON() as { orderId?: number; isOutOfStock?: boolean };
      assignPosts.push(body);
      if (body.orderId != null && body.isOutOfStock) oosIds.add(body.orderId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/m/work?tab=all');
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toBeVisible();

    await page.getByTestId('to-ship-sort').click();
    await page.getByRole('menuitem', { name: 'Title A–Z' }).click();
    await expect(page).toHaveURL(/sort=title/);
    const list = page.getByTestId('to-ship-queue').locator('li');
    await expect(list.nth(0)).toContainText('Test Bike');
    await expect(list.nth(1)).toContainText('Zebra Frame');

    await page.getByTestId('to-ship-search').locator('input').fill('12-345678901234');
    await expect(page).toHaveURL(/q=12-345678901234/);
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toHaveCount(0);

    await page.getByText('Test Bike').click();
    await expect(page.getByTestId('to-ship-sheet')).toBeVisible();
    await page.getByTestId('to-ship-sheet').getByRole('button', { name: 'Out of stock' }).click();
    await expect.poll(() => assignPosts.length).toBe(1);
    expect(assignPosts[0]).toMatchObject({ orderId: 99, isOutOfStock: true });
    await expect(page.getByRole('button', { name: 'Test Bike' })).toBeVisible();
    await expect(
      page.getByTestId('to-ship-queue').getByRole('button', { name: 'Ship', exact: true }),
    ).toBeDisabled();
  });

  test('/m/pick shows the same chrome as /m/work', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            { ...{
              id: 99,
              order_id: '12-345678901234',
              product_title: 'Test Bike',
              condition: 'USED_A',
              quantity: '2',
              notes: 'Hold for photo',
              sku: 'SKU-1',
              serial_number: 'SN-TRAIL-1',
              catalog_category: 'Bikes',
              ship_by_date: '2026-09-02',
              shipping_tracking_number: '1Z999AA10123456784',
              shipment_id: 501,
              tester_id: 4,
              tester_name: 'Alex Pick',
              tester_color_hex: '#e11d48',
              tested_by: null,
              test_date_time: null,
              packer_id: 3,
              packer_name: 'Pat Pack',
              packer_color_hex: '#2563eb',
              packed_by_name: 'Pat Pack',
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '123456789012',
              is_out_of_stock: false,
            } },
          ],
        }),
      }),
    );
    await page.goto('/m/pick');
    await expect(page.getByTestId('to-ship-queue')).toBeVisible();
    await expect(page.getByTestId('to-ship-search')).toBeVisible();
    await expect(page.getByTestId('to-ship-more')).toHaveCount(0);
    await expect(page.getByTestId('to-ship-listing').first()).toBeVisible();
    await expect(page.getByTestId('to-ship-queue').getByRole('button', { name: 'Ship', exact: true }).first()).toBeVisible();
    await expect(page.getByText('Test Bike')).toBeVisible();
  });

  test('search by SKU and condition hides the other row', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 99,
              order_id: '12-345678901234',
              product_title: 'Test Bike',
              condition: 'USED_A',
              quantity: '2',
              notes: 'Hold for photo',
              sku: 'SKU-1',
              serial_number: 'SN-TRAIL-1',
              catalog_category: 'Bikes',
              ship_by_date: '2026-09-02',
              shipping_tracking_number: '1Z999AA10123456784',
              tester_id: 4,
              tester_name: 'Alex Pick',
              tested_by: null,
              test_date_time: null,
              packer_id: 3,
              packed_by_name: 'Pat Pack',
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '123456789012',
              is_out_of_stock: false,
            },
            {
              id: 100,
              order_id: '98-000000000001',
              product_title: 'Zebra Frame',
              condition: 'USED_B',
              quantity: '1',
              notes: '',
              sku: 'SKU-Z',
              serial_number: '',
              catalog_category: 'Frames',
              ship_by_date: '2026-09-03',
              shipping_tracking_number: '',
              tester_id: null,
              tester_name: null,
              tested_by: null,
              test_date_time: null,
              packer_id: null,
              packed_by_name: null,
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '111',
              is_out_of_stock: false,
            },
          ],
        }),
      }),
    );
    await page.goto('/m/work?tab=all');
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toBeVisible();
    await page.getByTestId('to-ship-search').locator('input').fill('SKU-1');
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toHaveCount(0);
    await page.getByTestId('to-ship-search').locator('input').fill('USED_A');
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toHaveCount(0);
    await page.getByTestId('to-ship-search').locator('input').fill('A');
    await expect(page.getByText('Test Bike')).toBeVisible();
    await expect(page.getByText('Zebra Frame')).toHaveCount(0);
  });

  test('default sort puts the sooner ship-by first', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 100,
              order_id: '98-000000000001',
              product_title: 'Zebra Frame',
              condition: 'USED_B',
              quantity: '1',
              notes: '',
              sku: 'SKU-Z',
              serial_number: '',
              ship_by_date: '2026-09-03',
              shipping_tracking_number: '',
              tester_id: null,
              tester_name: null,
              tested_by: null,
              test_date_time: null,
              packer_id: null,
              packed_by_name: null,
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '111',
              is_out_of_stock: false,
            },
            {
              id: 99,
              order_id: '12-345678901234',
              product_title: 'Test Bike',
              condition: 'USED_A',
              quantity: '2',
              notes: 'Hold for photo',
              sku: 'SKU-1',
              serial_number: '',
              ship_by_date: '2026-09-02',
              shipping_tracking_number: '1Z999AA10123456784',
              tester_id: 4,
              tester_name: 'Alex Pick',
              tested_by: null,
              test_date_time: null,
              packer_id: 3,
              packed_by_name: 'Pat Pack',
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '123456789012',
              is_out_of_stock: false,
            },
          ],
        }),
      }),
    );
    await page.goto('/m/work?tab=all');
    await expect(page).not.toHaveURL(/sort=/);
    const list = page.getByTestId('to-ship-queue').locator('li');
    await expect(list.nth(0)).toContainText('Test Bike');
    await expect(list.nth(1)).toContainText('Zebra Frame');
  });

  test('pass pick posts testerId and testerName', async ({ page }) => {
    await page.route('**/api/work-orders/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) }),
    );
    await page.route('**/api/staff**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 7, name: 'Sam Tech', role: 'technician', role_keys: ['technician'] },
          { id: 3, name: 'Pat Pack', role: 'packer', role_keys: ['packer'] },
        ]),
      }),
    );
    await page.route('**/api/orders?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 99,
              order_id: '12-345678901234',
              product_title: 'Test Bike',
              condition: 'USED_A',
              quantity: '2',
              notes: 'Hold for photo',
              sku: 'SKU-1',
              serial_number: '',
              ship_by_date: '2026-09-02',
              shipping_tracking_number: '1Z999AA10123456784',
              tester_id: 4,
              tester_name: 'Alex Pick',
              tester_color_hex: '#e11d48',
              tested_by: null,
              test_date_time: null,
              packer_id: 3,
              packed_by_name: 'Pat Pack',
              packed_by: null,
              packed_at: null,
              packer_photos_url: null,
              tracking_type: null,
              account_source: 'ebay',
              item_number: '123456789012',
              is_out_of_stock: false,
            },
          ],
        }),
      }),
    );
    const assignPosts: unknown[] = [];
    await page.route('**/api/orders/assign**', async (route) => {
      assignPosts.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    await page.goto('/m/work?tab=all');
    await page.getByText('Test Bike').click();
    await expect(page.getByTestId('to-ship-sheet')).toBeVisible();
    await page.getByRole('button', { name: 'Pass pick' }).click();
    await expect(page.getByTestId('to-ship-pass-pick')).toBeVisible();
    await page.getByRole('button', { name: 'Pass pick to Sam Tech' }).click();
    await expect.poll(() => assignPosts.length).toBe(1);
    expect(assignPosts[0]).toMatchObject({ orderId: 99, testerId: 7, testerName: 'Sam Tech' });
  });
});
