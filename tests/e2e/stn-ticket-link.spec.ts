import { test, expect } from '@playwright/test';

/**
 * Outbound → shipment inspector → "Link ticket" → StnTicketLinkModal.
 *
 * Verifies the shipment-side half of many-STN-per-ticket linking:
 *   - the per-STN "Link ticket" affordance renders in the shipping section
 *   - it opens the modal anchored to that STN
 *   - the picker queries the universal waist in REFERENCE mode
 *     (mode=reference is what stops the server hiding tickets that are already
 *     anchored to a carton/order — without it the list would be empty of exactly
 *     the tickets an operator wants to attach a second shipment to)
 *
 * ⚠ READ-ONLY BY DESIGN. This suite drives the same DATABASE_URL as `pnpm dev`
 * (playwright.config.ts loads the same .env), and the link POST calls the live
 * helpdesk. So it asserts up to — and NOT including — the mutation. The
 * link/unlink round-trip belongs in a seeded/QA-tenant run; see the skipped test
 * at the bottom for the shape it should take.
 *
 * ⚠ Also: until the legacy UNIQUE (organization_id, zendesk_ticket_id) is
 * dropped, a SECOND STN on one ticket is rejected by the database, so the
 * many-link path this feature exists for is not yet exercisable at all.
 */

test.describe('Outbound → link a support ticket to an STN', () => {
  test('per-STN Link ticket opens the modal and loads candidates in reference mode', async ({
    page,
  }) => {
    // Postage queue hosts shipments with STNs; Ready is now an FBA stage tab
    // (allocation history) and does not own the link-ticket affordance.
    await page.goto('/shipping/labels');

    // Pick the first order row that opens the details panel. The panel hosts the
    // shipping section that owns the affordance.
    // The outbound queue lives in the sidebar (`complementary`); `main` is the
    // workspace and stays empty until a row is picked.
    const firstRow = page
      .getByRole('complementary')
      .locator('button')
      .filter({ hasText: /\d{3}/ })
      .first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await firstRow.click();

    const linkBtn = page.getByRole('button', { name: /^Link ticket$/ }).first();
    if ((await linkBtn.count()) === 0) {
      test.skip(
        true,
        'No shipment with a registered STN on the first page — the affordance only renders for a tracking row that has a shipmentId.',
      );
    }

    // The candidates request must carry the shipment anchor AND reference mode.
    const candidates = page.waitForRequest(
      (req) =>
        req.url().includes('/api/support/tickets/link') &&
        req.url().includes('anchorType=shipment') &&
        req.url().includes('mode=reference'),
      { timeout: 20_000 },
    );

    await linkBtn.click();

    const modal = page.getByLabel('Link a support ticket to this shipment');
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText(/Pick the ticket this shipment belongs to/i),
    ).toBeVisible();

    await candidates;

    // Link stays disabled until a ticket is chosen — no accidental no-op POST.
    await expect(modal.getByRole('button', { name: /^Link ticket$/ })).toBeDisabled();
    await expect(modal.getByText(/Select a ticket to link\./i)).toBeVisible();

    // Close without mutating.
    await modal.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(modal).toBeHidden();
  });

  test('support hub keeps the tracking-link control after a tracking resolves', async ({
    page,
  }) => {
    // Regression for the gate that made many-STN unreachable from the ticket
    // side: LinkageStrip used to hide "Link tracking" as soon as ANY tracking
    // resolved (`!tracking`), so a second STN could never be added.
    await page.goto('/support');

    const firstTicket = page.locator('[data-ticket-id], aside button').first();
    if ((await firstTicket.count()) === 0) {
      test.skip(true, 'No tickets in the queue to open.');
    }
    await firstTicket.click();

    const links = page.getByRole('button', { name: /Links/i }).first();
    if ((await links.count()) === 0) {
      test.skip(true, 'Ticket detail did not render the Links control.');
    }
    await links.click();

    // Present whether or not the ticket already has a tracking number.
    await expect(page.getByText(/Link tracking/i).first()).toBeVisible({ timeout: 15_000 });
  });

  // eslint-disable-next-line playwright/no-skipped-test
  test.skip('links two STNs to one ticket (needs the legacy unique dropped + a seeded tenant)', async () => {
    // 1. POST reference { ticketId, reference: { shipmentId: A } } → 200, isPrimary true
    //    (first STN on a ticket with no anchor becomes the anchor)
    // 2. POST reference { ticketId, reference: { shipmentId: B } } → 200, isPrimary false
    //    ← THIS is what the legacy UNIQUE (organization_id, zendesk_ticket_id)
    //      currently rejects at the database.
    // 3. GET ?ticketId=&list=shipments → both STNs, anchor first
    // 4. DELETE ?reference=1&shipmentId=A → B is PROMOTED to anchor
    //    (removeTicketShipmentReference's successor promotion; without it the
    //     ticket would hold rows but no anchor and read as unlinked)
    // 5. Support hub timeline shows "Ticket linked" ×2 then "Ticket unlinked"
    //    — the unlinked row only exists because it comes from ops_events, not
    //      ticket_links row state.
  });
});
