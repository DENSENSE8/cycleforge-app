import { test, expect } from '@playwright/test';

/**
 * Unbox surface — time-to-meaningful-content contract.
 *
 * Pins the paint path the spine-first refactor established:
 *   1. The table body paints meaningful content (rows or the teaching empty)
 *      promptly — never a lingering skeleton/blank pane.
 *   2. One data flow per view: the default History tab issues exactly one
 *      `phase=spine` fast-paint fetch and at most one authoritative
 *      `include=serials` fetch for `view=activity`. A second authoritative
 *      fetch of the same view = the KPI-strip duplicate-fetch bug regressing.
 *   3. The cf-paint marks stamp in contract order (chrome ≤ kpi/table).
 *
 * Timeouts are sized for a cold dev-server compile; on a prod build the
 * content paints well inside the 5s product budget.
 */

test.describe('unbox paint path', () => {
  test.skip(({ isMobile }) => !!isMobile, '/unbox table workbench is desktop-only');

  test('paints table content over a single spine→full data flow', async ({ page }) => {
    const activityRequests: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/api/receiving-lines?') && url.includes('view=activity')) {
        activityRequests.push(url);
      }
    });

    await page.goto('/unbox');

    // Workbench chrome (tabs) paints without waiting on any table API.
    await expect(page.getByRole('button', { name: 'Queue', exact: true })).toBeVisible();

    // Table body reaches meaningful content — rows or the teaching empty,
    // with the skeleton gone.
    const body = page.getByTestId('column-table-body');
    await expect(body).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        () =>
          body.evaluate(
            (el) =>
              !el.querySelector('.animate-pulse') &&
              (el.textContent ?? '').trim().length > 0,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    // Data flow: exactly one spine fetch; at most one authoritative fetch.
    // (The KPI strip must NOT add a second include=serials fetch of the view.)
    await expect
      .poll(() => activityRequests.filter((u) => u.includes('phase=spine')).length, {
        timeout: 15_000,
      })
      .toBe(1);
    const authoritative = activityRequests.filter((u) => u.includes('include=serials'));
    expect(authoritative.length).toBeLessThanOrEqual(1);
    expect(activityRequests.length).toBeLessThanOrEqual(2);

    // Paint marks stamped in contract order: chrome first, then kpi/table.
    const marks = await page.evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('cf-paint:'))
        .map((m) => ({ name: m.name, at: Math.round(m.startTime) })),
    );
    const at = (name: string) => marks.find((m) => m.name === `cf-paint:${name}`)?.at;
    expect(at('unbox:chrome')).toBeDefined();
    expect(at('unbox:kpi')).toBeDefined();
    expect(at('unbox:table')).toBeDefined();
    expect(at('unbox:chrome')!).toBeLessThanOrEqual(at('unbox:kpi')!);
    expect(at('unbox:chrome')!).toBeLessThanOrEqual(at('unbox:table')!);
  });
});
