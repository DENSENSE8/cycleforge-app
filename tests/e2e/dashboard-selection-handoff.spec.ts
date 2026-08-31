import { test, expect } from '@playwright/test';
import { testingHandoffHref } from '@/lib/selection-context/station-handoff';

/**
 * Pending record plane → the next station.
 *
 * One quiet deep-link, not a CTA repeated beside every document. It is a
 * NAVIGATION: the dashboard hands the order to Testing and does not allocate,
 * release, or substitute on the way.
 *
 * The href uses only params `/test` declares (`TEST_ROUTE_PARAMS`) — the
 * boundary parse (`useSurfaceParamHygiene`) drops anything else, so an invented
 * `?openOrderId=` would silently lose its argument on arrival.
 */

test.describe('Pending → Testing hand-off', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  test('the record plane offers Open in Testing and it survives the boundary parse', async ({
    page,
  }) => {
    await page.goto('/dashboard?unshipped');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.locator('[data-col="item"]').click();
    await expect(page.locator('aside[role="region"]')).toBeVisible({ timeout: 20_000 });
    // Opens docs-first, and the hand-off sits under the paperwork it gates.
    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const handoff = page.getByTestId('order-handoff-testing');
    await expect(handoff).toBeVisible({ timeout: 20_000 });

    const href = await handoff.getAttribute('href');
    expect(href).toBeTruthy();
    const seeded = new URL(href!, 'http://localhost').searchParams;
    expect(seeded.get('view')).toBe('testing');
    expect(String(seeded.get('search') ?? '').trim().length).toBeGreaterThan(0);
    // Built by the shared helper — no second href recipe on the call site.
    expect(href).toBe(testingHandoffHref(seeded.get('search')));

    await handoff.click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe('/test');

    // The seed must SURVIVE `useSurfaceParamHygiene`, which strips every param
    // the route does not declare. This is the assertion that would have caught
    // an invented id scheme.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('search'), { timeout: 20_000 })
      .toBe(seeded.get('search'));
    expect(new URL(page.url()).searchParams.get('view')).toBe('testing');
  });
});
