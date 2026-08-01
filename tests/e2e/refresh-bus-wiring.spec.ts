import { test, expect, type Page } from '@playwright/test';

/**
 * Refresh-bus wiring, verified against the running app.
 *
 * Slice 2 replaced two global broadcasts with domain signals. Types cannot catch
 * the failure mode that matters: a pane whose subscription no longer wakes, or a
 * write mapped to too few domains. This drives the real bus in the real app and
 * records which endpoints each domain actually refetches.
 *
 * Desktop-only (the panels under test are desktop sidebars).
 */

const REFRESH_EVENT = 'cf:refresh';

/** Dispatch a domain signal exactly as `refreshDomains()` does. */
async function signal(page: Page, domains: string[]): Promise<void> {
  await page.evaluate(
    ([eventName, list]) => {
      window.dispatchEvent(
        new CustomEvent(eventName as string, { detail: { domains: list as string[] } }),
      );
    },
    [REFRESH_EVENT, domains] as const,
  );
}

/** API paths requested while `run` executes (plus a settle window). */
async function apiCallsDuring(page: Page, run: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const onRequest = (r: import('@playwright/test').Request) => {
    const { pathname } = new URL(r.url());
    // The rail snapshot is an ambient persist (rail-snapshot-client.ts), fired
    // on its own cadence — counting it would make every domain look "wired".
    if (pathname === '/api/receiving/rail-snapshot') return;
    if (pathname.startsWith('/api/')) seen.push(pathname);
  };
  // Drain anything still in flight so it cannot be attributed to this window.
  await page.waitForTimeout(3000);
  page.on('request', onRequest);
  await run();
  // The sidebar rails debounce their reconciling refetch (RAIL_REFRESH_DEBOUNCE_MS).
  await page.waitForTimeout(2500);
  page.off('request', onRequest);
  return [...new Set(seen)];
}

async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/signin') {
    test.skip(true, 'no session for this project (tests/.auth is empty)');
  }
  // Let first-mount queries settle so they are not counted as refetches.
  await page.waitForTimeout(4000);
}

test.describe('refresh bus wiring', () => {
  test.skip(({ isMobile }) => !!isMobile, 'these panels are desktop sidebars');
  test.describe.configure({ timeout: 120_000 });

  test('a walk-in sale (replenish) refetches need-to-order and nothing else', async ({ page }) => {
    // ReplenishSidebarPanel mounts only on this section (InventorySidebarPanel:100).
    await gotoAuthed(page, '/inventory?section=replenish');

    const onUnrelated = await apiCallsDuring(page, () => signal(page, ['repairs', 'work-orders']));
    const onReplenish = await apiCallsDuring(page, () => signal(page, ['replenish']));

    console.log('[replenish] refetched:', JSON.stringify(onReplenish));
    console.log('[unrelated] refetched:', JSON.stringify(onUnrelated));

    // The domain salesCartStore now signals must actually reach the counts panel.
    expect(
      onReplenish.some((p) => p.includes('/api/need-to-order')),
      `'replenish' must refetch need-to-order; saw ${JSON.stringify(onReplenish)}`,
    ).toBe(true);

    // …and the fan-out must genuinely be gone: an unrelated domain must not.
    expect(
      onUnrelated.some((p) => p.includes('/api/need-to-order')),
      `unrelated domains must NOT refetch need-to-order; saw ${JSON.stringify(onUnrelated)}`,
    ).toBe(false);
  });

  test('a data wipe (receiving.lines) refetches the receiving list', async ({ page }) => {
    await gotoAuthed(page, '/unbox');

    const onUnrelated = await apiCallsDuring(page, () => signal(page, ['replenish', 'repairs']));
    const onReceiving = await apiCallsDuring(page, () => signal(page, ['receiving.lines']));

    console.log('[receiving.lines] refetched:', JSON.stringify(onReceiving));
    console.log('[unrelated] refetched:', JSON.stringify(onUnrelated));

    expect(
      onReceiving.some((p) => p.includes('/api/receiving')),
      `the wipe's domains must refetch the receiving list; saw ${JSON.stringify(onReceiving)}`,
    ).toBe(true);

    expect(
      onUnrelated.some((p) => p.includes('/api/receiving')),
      `unrelated domains must NOT refetch receiving; saw ${JSON.stringify(onUnrelated)}`,
    ).toBe(false);
  });

  /**
   * Diagnostic: what each domain actually wakes on a receiving surface. Not an
   * assertion — it prints the live domain→endpoint map so a mapping decision can
   * be checked against reality instead of inferred from imports.
   */
  test('domain → endpoint map on /unbox', async ({ page }) => {
    await gotoAuthed(page, '/unbox');
    const domains = [
      'orders.outbound', 'packer.logs', 'receiving.lines',
      'receiving.poLines', 'repairs', 'replenish', 'work-orders',
    ];
    for (const domain of domains) {
      const calls = await apiCallsDuring(page, () => signal(page, [domain]));
      console.log(`[map] ${domain} -> ${calls.length ? JSON.stringify(calls) : '(nothing)'}`);
    }
  });
});
