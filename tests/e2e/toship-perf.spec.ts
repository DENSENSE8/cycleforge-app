import { test, expect } from '@playwright/test';
import { QA_FIXTURE_ORDERS, QA_FIXTURE_ORDER_TITLES } from '@/lib/tenancy/qa-org';

/**
 * `/shipping/orders` — where the To-ship minute goes.
 *
 * Measurement first (the console block is the deliverable), with hard
 * assertions that we measured the RIGHT PAGE on the RIGHT TENANT: the desk
 * stayed the desk, a row actually painted, and the seeded QA fixture order is
 * in the list the desk reads.
 *
 * **QA org only (`qa-desktop`).** The `desktop` project is unauthenticated in
 * this checkout — it 401s, lands on `/signin`, and reports a fast, healthy load
 * for a page that is not the desk at all. A green run on the wrong surface is
 * worse than a red one, so this spec pins its project instead of trusting
 * whatever ran. Seed, then run:
 *
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/toship-perf.spec.ts --project=qa-desktop --reporter=list
 *
 * Scope of what these numbers mean: the QA tenant is deterministic and small,
 * so this measures the SHELL / BUNDLE / RENDER budget. The per-candidate-row
 * SQL cost is a dogfood-SCALE fact — `EXPLAIN ANALYZE` against that DB is its
 * instrument. Nothing here asserts a row count; counts are logged as
 * diagnostics only, because a threshold on tenant rows is exactly the kind of
 * assertion that passes vacuously when a lane happens to be empty
 * (`.claude/rules/verify.md`).
 */

/** The canonical row hook on this family (`OrdersQueueTableRow`). */
const ORDER_ROW = '[data-order-row-id]';

test('To-ship paint budget', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'qa-desktop',
    'QA org fixtures — qa-desktop project (the `desktop` project is unauthenticated here and would measure /signin)',
  );
  test.setTimeout(180_000);

  const calls: { url: string; ms: number; status: number; bytes: number }[] = [];
  page.on('requestfinished', async (req) => {
    try {
      const t = req.timing();
      const res = await req.response();
      if (!res) return;
      const u = new URL(req.url());
      if (!u.pathname.startsWith('/api/')) return;
      const body = await res.body().catch(() => Buffer.alloc(0));
      calls.push({
        url: u.pathname + u.search.slice(0, 80),
        ms: Math.round(t.responseEnd - t.requestStart),
        status: res.status(),
        bytes: body.length,
      });
    } catch { /* ignore */ }
  });

  const t0 = Date.now();
  await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
  const domReady = Date.now() - t0;

  // Fail FAST and loud on the auth miss, before the long row wait — a session
  // that bounced to /signin makes every number below a measurement of the
  // sign-in page.
  expect(page.url(), 'measured the To-ship desk, not a signin bounce').toContain('/shipping/orders');

  // First row painted = the thing the operator waits for.
  const firstRow = page.locator(ORDER_ROW).first();
  let rowMs = -1;
  try {
    await firstRow.waitFor({ state: 'visible', timeout: 150_000 });
    rowMs = Date.now() - t0;
  } catch { /* never painted */ }

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint').map((p) => ({ name: p.name, ms: Math.round(p.startTime) }));
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const js = res.filter((r) => r.name.includes('/_next/static/'));
    return {
      ttfb: n ? Math.round(n.responseStart - n.requestStart) : -1,
      domContentLoaded: n ? Math.round(n.domContentLoadedEventEnd) : -1,
      loadEvent: n ? Math.round(n.loadEventEnd) : -1,
      paints,
      jsChunks: js.length,
      jsBytes: js.reduce((a, r) => a + (r.transferSize || 0), 0),
      slowestJs: js.map((r) => ({ n: r.name.split('/').pop()?.slice(0, 44), ms: Math.round(r.duration) }))
        .sort((a, b) => b.ms - a.ms).slice(0, 6),
    };
  });

  // Diagnostics only — the QA org's row mix is a fixture, never a threshold.
  const rowCount = await page.locator(ORDER_ROW).count().catch(() => -1);
  // The fixture row may sit outside the virtualized render window, so this is
  // reported, not asserted; the tenant proof below is window-independent.
  const fixtureRowRendered = await page
    .locator(ORDER_ROW)
    .filter({ hasText: QA_FIXTURE_ORDER_TITLES.pending })
    .count()
    .catch(() => -1);

  // The list query on its own, after the paint is done so it cannot distort the
  // numbers above — the server-side half of the budget, isolated from the shell.
  const listT0 = Date.now();
  const ordersRes = await page.request.get('/api/orders?limit=200');
  const listMs = Date.now() - listT0;

  console.log('\n════════ TO-SHIP PAINT BUDGET ════════');
  console.log(`  project          : ${testInfo.project.name} (QA org)`);
  console.log(`  domcontentloaded : ${domReady} ms`);
  console.log(`  FIRST ROW VISIBLE: ${rowMs === -1 ? 'NEVER (timed out)' : rowMs + ' ms'}`);
  console.log(`  ttfb             : ${nav.ttfb} ms`);
  console.log(`  load event       : ${nav.loadEvent} ms`);
  console.log(`  paints           : ${nav.paints.map((p) => `${p.name}=${p.ms}ms`).join('  ')}`);
  console.log(`  JS chunks        : ${nav.jsChunks}  (${Math.round(nav.jsBytes / 1024)} KB transferred)`);
  console.log(`  slowest JS       : ${nav.slowestJs.map((j) => `${j.n} ${j.ms}ms`).join('\n                     ')}`);
  console.log(`  rows in DOM      : ${rowCount}  (QA fixture row in window: ${fixtureRowRendered})`);
  console.log(`  /api/orders solo : ${listMs} ms  ${ordersRes.status()}`);
  console.log('\n  ── API calls, slowest first ──');
  for (const c of calls.sort((a, b) => b.ms - a.ms).slice(0, 14)) {
    console.log(`  ${String(c.ms).padStart(7)} ms  ${String(Math.round(c.bytes / 1024)).padStart(6)} KB  ${c.status}  ${c.url}`);
  }
  console.log(`  (${calls.length} API calls total, ${Math.round(calls.reduce((a, c) => a + c.bytes, 0) / 1024)} KB)`);
  console.log('══════════════════════════════════════\n');

  expect(rowMs, 'a row must eventually paint').toBeGreaterThan(0);

  // Tenant proof: the seeded QA Pending order, by fixture constant. Asserted on
  // the LIST rather than the DOM because the grid virtualizes — a fixture row
  // below the render window is not evidence of a wrong tenant, but a list
  // without it is.
  expect(ordersRes.ok(), '/api/orders on the QA session').toBeTruthy();
  const orders = (((await ordersRes.json()) as { orders?: Array<{ order_id?: string }> }).orders ?? []);
  expect(
    orders.some((o) => o.order_id === QA_FIXTURE_ORDERS.pending),
    `QA fixture order ${QA_FIXTURE_ORDERS.pending} is missing — measured tenant is not the QA org, or run \`pnpm provision:qa-org\``,
  ).toBeTruthy();
});
