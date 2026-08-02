import { test, expect, type Page } from '@playwright/test';

/**
 * Settings collection tables → house `DataTable` SoT smoke.
 *
 * Asserts Sessions mounts the framed `[data-table-surface]` shell (not a
 * hand-rolled collection `<table>` outside DataTable) against a route-mocked
 * `/api/admin/sessions` payload — DB-independent, auth via global-setup.
 */

async function mockSessions(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/admin/sessions',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessions: [
            {
              sid: 'sess_e2e_datatable_1',
              staff_id: 1,
              staff_name: 'E2E Admin',
              device_kind: 'desktop',
              device_label: 'Smoke Chrome',
              ip: '127.0.0.1',
              created_at: '2026-08-01T12:00:00.000Z',
              last_seen_at: '2026-08-01T18:00:00.000Z',
              expires_at: '2026-08-08T12:00:00.000Z',
            },
          ],
        }),
      });
    },
  );
}

test.describe('Settings DataTable smoke', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('Sessions mounts DataTable surface (no raw collection table)', async ({ page }) => {
    await mockSessions(page);
    await page.goto('/settings?section=sessions', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Anyone signed in right now/i)).toBeVisible({ timeout: 45_000 });

    const surface = page.locator('[data-table-surface]').first();
    await expect(surface).toBeVisible();
    await expect(surface.getByRole('columnheader', { name: 'Staff' })).toBeVisible();
    await expect(surface.getByText('E2E Admin')).toBeVisible();
    await expect(surface.getByRole('button', { name: 'Revoke' })).toBeVisible();

    // Every collection <table> in main must live inside the DataTable surface.
    const tables = page.locator('main table');
    const count = await tables.count();
    expect(count, 'at least one DataTable <table>').toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const inSurface = await tables.nth(i).evaluate((el) => !!el.closest('[data-table-surface]'));
      expect(inSurface, `table[${i}] must be inside [data-table-surface]`).toBe(true);
    }
  });
});
