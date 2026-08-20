import { test, expect } from '@playwright/test';

/**
 * The MasterNav spine's find field is top-pinned (ruled 2026-08-19) — under the
 * 40px top band, above the first section row (Scan Stations), outside the
 * scrolling map.
 *
 * Measured in the real runner because the claim is geometric: the guard can
 * pin render ORDER in the source, but only a browser can say the field is
 * actually above the first row and actually stays put while the map scrolls.
 */
test('the spine find sits above Scan Stations and does not scroll away', async ({ page }) => {
  await page.goto('/unbox');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

  // The spine is closed on every cold load (unpersisted `navOpen`).
  // `navOpen` is an unpersisted useState(false), so the spine is CLOSED on every
  // cold load — the band mounts but paints at zero width until it is opened.
  const show = page.getByRole('button', { name: 'Show navigation' });
  if ((await show.count()) > 0) await show.first().click();
  await page.waitForTimeout(600);
  const find = page.locator('[data-spine-find]');
  await expect(find, 'the spine find band is mounted').toBeVisible({ timeout: 15_000 });

  const geo = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const findEl = document.querySelector('[data-spine-find]');
    const port = document.querySelector('[data-spine-scrollport]');
    const stations = port?.querySelector('[aria-label="Scan Stations"], li');
    return {
      find: box(findEl ?? null),
      port: box(port ?? null),
      firstRow: box(stations ?? null),
      inputs: findEl ? findEl.querySelectorAll('input').length : 0,
      insidePort: !!(port && findEl && port.contains(findEl)),
    };
  });
  // eslint-disable-next-line no-console
  console.log('SPINE FIND', JSON.stringify(geo, null, 1));

  expect(geo.inputs, 'one find field').toBe(1);
  expect(geo.insidePort, 'the find band is NOT inside the scrolling map').toBe(false);
  expect(geo.find!.y, 'find sits above the map').toBeLessThan(geo.port!.y);
  expect(geo.find!.y, 'find sits above the first section row').toBeLessThan(geo.firstRow!.y);
  expect(
    Math.abs(geo.find!.w - geo.port!.w),
    'find spans the spine width',
  ).toBeLessThanOrEqual(4);

  // Typing swaps the map for ranked destinations, and the field stays put.
  const beforeY = geo.find!.y;
  await find.locator('input').fill('unbox');
  await page.waitForTimeout(500);
  const afterY = await find.evaluate((el) => Math.round(el.getBoundingClientRect().y));
  expect(afterY, 'the find band does not move when results replace the map').toBe(beforeY);
});
