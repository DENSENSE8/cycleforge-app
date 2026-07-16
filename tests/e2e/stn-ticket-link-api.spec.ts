import { test, expect } from '@playwright/test';

/**
 * Many-STN ↔ ticket linking — route + domain + DB, through the real auth stack.
 *
 * Complements stn-ticket-link.spec.ts (which drives the UI): this one exercises
 * the universal waist directly, so a failure points at the route/domain rather
 * than at a selector.
 *
 * ⚠ Runs against the SAME DATABASE_URL as `pnpm dev` and calls the live
 * helpdesk. It therefore uses READ paths only — the write round-trip (link two
 * STNs, promote-on-unlink) is proven at the SQL level instead, because a POST
 * here would create real ticket_links rows and hit the real Zendesk API against
 * production data.
 */

test.describe('support ticket ↔ shipment link API', () => {
  test('GET ?list=shipments returns a ticket\'s STN references', async ({ request }) => {
    // A ticket with no references is the honest empty case: 200 + [].
    const res = await request.get('/api/support/tickets/link?ticketId=999999001&list=shipments');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.shipments)).toBe(true);
  });

  test('GET candidates in reference mode does not hide anchored tickets', async ({ request }) => {
    // Pick any real STN so the anchor resolves.
    const anchorMode = await request.get(
      '/api/support/tickets/link?anchorType=shipment&shipmentId=1&mode=anchor',
    );
    const refMode = await request.get(
      '/api/support/tickets/link?anchorType=shipment&shipmentId=1&mode=reference',
    );

    // Both must be reachable (or both blocked by helpdesk config — never one of each).
    expect([200, 503]).toContain(anchorMode.status());
    expect([200, 503]).toContain(refMode.status());
    if (anchorMode.status() !== 200) {
      test.skip(true, 'Helpdesk not connected in this environment.');
    }

    const a = await anchorMode.json();
    const r = await refMode.json();

    // The contract: reference mode hides nothing. Anchor mode may hide tickets
    // that are linked elsewhere; reference mode must not, because attaching an
    // extra shipment does not re-anchor the ticket.
    expect(r.hiddenLinked).toBe(0);
    expect(r.tickets.length).toBeGreaterThanOrEqual(a.tickets.length);
  });

  test('rejects a malformed reference body', async ({ request }) => {
    const res = await request.post('/api/support/tickets/link', {
      data: { ticketId: 1, reference: {} },
    });
    // Zod must reject: neither shipmentId nor trackingNumber supplied.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
