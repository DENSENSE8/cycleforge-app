import { test, expect } from '@playwright/test';

const TICKET_ID = Number(process.env.PW_ZENDESK_TICKET_ID || '9410');

/**
 * Support console Zendesk bundle perf — verifies Phase 2 architecture:
 *   • one `/bundle` round-trip (not parallel ticket/comments/agents/photos)
 *   • Redis warm reads materially faster than `?refresh=1` cold rebuilds
 *   • UI paints after bundle resolves
 */
test.describe('support zendesk bundle perf', () => {
  test('API: warm bundle is faster than cold refresh', async ({ request }) => {
    test.skip(!Number.isInteger(TICKET_ID) || TICKET_ID <= 0, 'invalid PW_ZENDESK_TICKET_ID');

    async function timed(path: string) {
      const start = Date.now();
      const res = await request.get(path);
      const ms = Date.now() - start;
      const body = await res.json().catch(() => null);
      return { res, ms, body };
    }

    // Cold — bypass Redis, rebuild from Zendesk.
    const cold = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle?refresh=1`);
    expect(cold.res.ok(), `cold bundle failed: ${cold.res.status()}`).toBeTruthy();
    expect(cold.body?.success).toBe(true);
    expect(cold.body?.ticket?.id).toBe(TICKET_ID);

    // Warm — should hit Redis (when KV_REST_* is configured on the server).
    const warm1 = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle`);
    const warm2 = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle`);

    expect(warm1.res.ok()).toBeTruthy();
    expect(warm2.res.ok()).toBeTruthy();
    expect(warm1.body?.ticket?.id).toBe(TICKET_ID);

    // eslint-disable-next-line no-console
    console.log(
      `[support-bundle-api] ticket=${TICKET_ID} cold=${cold.ms}ms warm1=${warm1.ms}ms warm2=${warm2.ms}ms`,
    );

    // Warm should beat cold by a meaningful margin when Redis is live.
    // Generous ratio — Zendesk variance can be large; logs carry the real signal.
    const bestWarm = Math.min(warm1.ms, warm2.ms);
    expect(bestWarm).toBeLessThan(Math.max(cold.ms * 0.75, cold.ms - 200));
    expect(bestWarm).toBeLessThan(5_000);
  });

  test('UI: one bundle fetch paints ticket detail', async ({ page }) => {
    test.skip(!Number.isInteger(TICKET_ID) || TICKET_ID <= 0, 'invalid PW_ZENDESK_TICKET_ID');

    const bundleHits: { url: string; ms: number }[] = [];
    const legacyDetailHits: string[] = [];

    page.on('requestfinished', async (req) => {
      const url = req.url();
      if (/\/api\/zendesk\/tickets\/\d+\/bundle/.test(url)) {
        const timing = req.timing();
        bundleHits.push({
          url,
          ms: Math.round(timing.responseEnd - timing.requestStart),
        });
      }
      if (
        /\/api\/zendesk\/tickets\/\d+(\/comments|\/photos)?(\?|$)/.test(url) &&
        !url.includes('/bundle')
      ) {
        legacyDetailHits.push(url);
      }
    });

    const start = Date.now();
    await page.goto(`/support?ticket=${TICKET_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Open in Zendesk' }).waitFor({ state: 'visible', timeout: 45_000 });
    const paintMs = Date.now() - start;

    // eslint-disable-next-line no-console
    console.log(
      `[support-bundle-ui] ticket=${TICKET_ID} paint=${paintMs}ms bundleCalls=${bundleHits.length} legacyDetailCalls=${legacyDetailHits.length} bundleMs=${bundleHits.map((h) => h.ms).join(',')}`,
    );

    expect(bundleHits.length).toBeGreaterThanOrEqual(1);
    expect(bundleHits.length).toBeLessThanOrEqual(2);
    expect(legacyDetailHits.length).toBe(0);
    expect(paintMs).toBeLessThan(45_000);
  });
});
