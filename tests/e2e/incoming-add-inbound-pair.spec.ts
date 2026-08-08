import { test, expect } from '@playwright/test';
import { QA_FIXTURE_ZOHO_ITEM } from '@/lib/tenancy/qa-org';

/**
 * Manual Add inbound → pair to Zoho inventory by title → lands on Incoming.
 *
 * Proves the operator flow: on /incoming, Add a purchase order, classify it as
 * an Amazon RETURN, search the Zoho `items` mirror by TITLE and pair a real
 * catalog SKU (not free text), give it an order # + tracking #, and see the row
 * arrive on the Incoming pipeline with the paired identity + classification.
 *
 * Two layers of proof:
 *   1. Pairing (the core ask) — the import POST carries the picked item's real
 *      `sku` + canonical `item_name` from the Zoho picker, plus kind=return and
 *      source_platform=amazon. If the picker were still free text this would
 *      carry whatever was typed, not the fixture's catalog identity.
 *   2. Surfacing — a pipeline row with THIS order #'s last-8 renders after the
 *      feeds refetch (QA force-enables `incoming_universal`, so a manual
 *      non-Zoho EXPECTED line is selected by view=incoming).
 *
 * Fixture: QA_FIXTURE_ZOHO_ITEM — an active `items` row whose sku matches the
 * `speaker` sku_catalog fixture, seeded by scripts/provision-qa-org.ts. Run
 * `pnpm provision:qa-org` before this spec, or the picker returns nothing.
 *
 * QA org only (global-setup handles auth). Never assert against the dogfood tenant.
 */
test.describe('Add inbound + Zoho pairing', () => {
  const OVERLAY = 'aside[role="region"][aria-label="Add inbound purchase or return"]';

  test('manual Amazon return pairs a Zoho item by title and lands on Incoming', async ({
    page,
  }) => {
    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming');
    await listReq;

    // Open the Add rail (green Add CTA → RightRailHost overlay, platform=amazon).
    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();

    // Classify → Type = RETURN (Platform defaults to Amazon on the Add CTA).
    await overlay.getByRole('combobox', { name: 'Type' }).click();
    await page.keyboard.type('return');
    await page.getByRole('option', { name: /return/i }).first().click();

    // Pair the item — search the Zoho items mirror by TITLE, then pick.
    const searchResp = page.waitForResponse(
      (r) => /\/api\/sku-catalog\/search\?/.test(r.url()) && r.url().includes('zoho_catalog'),
    );
    await overlay.getByRole('combobox', { name: 'Product' }).click();
    // A distinctive fragment of QA_FIXTURE_ZOHO_ITEM.title ("QA Bose SoundLink…").
    await page.keyboard.type('SoundLink');
    await searchResp;
    await page.getByRole('option', { name: /SoundLink/i }).first().click();

    // Identity — a unique order # so the pipeline row is unambiguous.
    const orderId = `QAADD-${Date.now()}`;
    const last8 = orderId.slice(-8);
    const tracking = `QATRK${Date.now()}`;
    await overlay.getByLabel('Amazon order #').fill(orderId);
    await overlay.getByLabel('Tracking #').fill(tracking);

    // Submit — capture the import payload (the pairing proof) + the response.
    const importReq = page.waitForRequest(
      (r) =>
        /\/api\/receiving\/inbound\/import-purchase/.test(r.url()) && r.method() === 'POST',
    );
    const importResp = page.waitForResponse((r) =>
      /\/api\/receiving\/inbound\/import-purchase/.test(r.url()),
    );
    await overlay.getByTestId('add-inbound-submit').click();

    const req = await importReq;
    expect(req.postDataJSON()).toMatchObject({
      kind: 'return',
      source_platform: 'amazon',
      order_id: orderId,
      // The picker bound the REAL catalog identity, not typed free text.
      sku: QA_FIXTURE_ZOHO_ITEM.sku,
      item_name: QA_FIXTURE_ZOHO_ITEM.title,
      tracking_number: tracking,
    });

    const resp = await importResp;
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { success?: boolean };
    expect(body.success).toBe(true);

    // Surfacing — the row arrives on the Incoming pipeline after the refetch.
    await page.waitForResponse((r) => /\/api\/receiving-lines(\?|$)/.test(r.url()));
    const myRow = page
      .locator('[data-line-row-id]')
      .filter({ has: page.locator('[data-col="order"]', { hasText: last8 }) });
    await expect(myRow.first()).toBeVisible({ timeout: 15_000 });
  });
});
