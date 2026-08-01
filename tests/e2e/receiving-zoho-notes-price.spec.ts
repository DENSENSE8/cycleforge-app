import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Receiving redesign — Zoho Notes + unit-price display.
 *
 * Verifies, end-to-end against the dev server:
 *   1. API: /api/receiving-lines returns the new fields — carton-level
 *      `receiving_zoho_notes` (overall PO note) + line `unit_price` (Zoho rate)
 *      + `zoho_notes` (per-line item description).
 *   2. UI: opening a matched carton in the unbox workspace shows the Zoho unit
 *      cost as the last meta chip in the PO row, and the Sync notes field (under
 *      "More notes") renders the overall PO note.
 *
 * Data-driven: picks a real carton that carries the fields (backfilled from
 * Zoho), so it doesn't depend on a hard-coded id.
 */

interface LineRow {
  id: number;
  receiving_id: number | null;
  receiving_source?: string | null;
  workflow_status?: string | null;
  unit_price?: string | null;
  zoho_notes?: string | null;
  receiving_zoho_notes?: string | null;
  /** Operator item note — never printed (2026-07-31 grain split). */
  notes?: string | null;
  /** Printed label face center text — the buffer `notes` used to double as. */
  label_note?: string | null;
}

const ACTIVE = new Set(['MATCHED', 'UNBOXED', 'ARRIVED', 'AWAITING_TEST']);

async function findCandidate(request: APIRequestContext): Promise<LineRow | null> {
  // Optional: pin to a specific carton/line (verify the exact carton a user reported).
  const pinRecv = process.env.PW_RECV_ID;
  const pinLine = process.env.PW_LINE_ID;
  if (pinRecv && pinLine) {
    const res = await request.get(`/api/receiving-lines?receiving_id=${pinRecv}&include=serials`);
    if (res.ok()) {
      const rows: LineRow[] = (await res.json()).receiving_lines ?? [];
      const hit = rows.find((r) => String(r.id) === String(pinLine));
      if (hit) return hit;
    }
  }
  for (const view of ['recent', 'all']) {
    const res = await request.get(`/api/receiving-lines?view=${view}&include=serials&limit=500`);
    if (!res.ok()) continue;
    const body = await res.json();
    const rows: LineRow[] = body.receiving_lines ?? [];
    // Wiring assertion: the new fields must be present on the row shape.
    if (rows.length) {
      expect(rows[0], 'row exposes receiving_zoho_notes key').toHaveProperty('receiving_zoho_notes');
      expect(rows[0], 'row exposes unit_price key').toHaveProperty('unit_price');
      // The four notes-family fields are four DIFFERENT grains. `notes` (the
      // operator's item note) and `label_note` (the printed face) were one
      // column until 2026-07-31; the row must carry both or the label editor
      // silently falls back to the item note.
      expect(rows[0], 'row exposes notes key').toHaveProperty('notes');
      expect(rows[0], 'row exposes label_note key').toHaveProperty('label_note');
    }
    const hit = rows.find(
      (r) =>
        r.receiving_id != null &&
        r.receiving_source !== 'unmatched' &&
        !!(r.receiving_zoho_notes && r.receiving_zoho_notes.trim()) &&
        r.unit_price != null &&
        ACTIVE.has(String(r.workflow_status ?? '').toUpperCase()),
    );
    if (hit) return hit;
  }
  return null;
}

test.describe('receiving — Zoho overall notes + unit price', () => {
  test('API exposes carton zoho_notes + line unit_price', async ({ request }) => {
    const hit = await findCandidate(request);
    expect(hit, 'a carton with overall zoho_notes + a priced line should exist (backfilled)').toBeTruthy();
    expect(hit!.receiving_zoho_notes!.trim().length).toBeGreaterThan(0);
    expect(Number(hit!.unit_price)).toBeGreaterThan(0);
  });

  test('UI shows the Zoho unit price and the Zoho notes field', async ({ page, request }) => {
    const hit = await findCandidate(request);
    test.skip(!hit, 'no backfilled carton available');
    const { receiving_id, id } = hit!;

    await page.goto(`/receiving?recvId=${receiving_id}&lineId=${id}`);

    // The PO-items accordion renders unit price as the trailing meta chip.
    const price = page.locator('[data-col="price"]').getByText(/\d+\.\d{2}/).first();
    await expect(price, 'Zoho unit price chip is visible in the line row').toBeVisible({ timeout: 25_000 });

    // Sync notes live behind "More notes" → Sync tab.
    const moreNotes = page.getByRole('button', { name: /More notes/i }).first();
    await expect(moreNotes).toBeVisible({ timeout: 15_000 });
    await moreNotes.click();

    const syncTab = page
      .getByRole('tab', { name: /^Sync$/i })
      .or(page.getByText('Sync', { exact: true }))
      .first();
    await expect(syncTab).toBeVisible({ timeout: 10_000 });
    await syncTab.click();

    await expect(page.getByText(/No notes imported from Zoho/i)).toHaveCount(0);
    const overallField = page.getByRole('textbox', { name: /Sync notes/i });
    await expect(overallField).toBeVisible({ timeout: 10_000 });
    await expect(overallField).toHaveValue(/\S/); // non-empty (carton note loaded)
    await expect(page.getByRole('button', { name: /Save to Zoho/i })).toBeVisible();
    // When the line carries a Zoho item description, it shows as a SEPARATE block
    // ("Item description") — distinct from the editable Zoho notes field.
    if (hit!.zoho_notes && hit!.zoho_notes.trim()) {
      await expect(page.getByText('Item description', { exact: false })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('PO row ⋮ menu toggles the inline item-description editor', async ({ page, request }) => {
    const hit = await findCandidate(request);
    test.skip(!hit, 'no backfilled carton available');
    await page.goto(`/receiving?recvId=${hit!.receiving_id}&lineId=${hit!.id}`);

    // Title-row ⋮ → Item description (synced) opens the inline editor.
    const lineMenu = page.getByRole('button', { name: /Line actions/i }).first();
    await expect(lineMenu).toBeVisible({ timeout: 25_000 });
    await lineMenu.click();
    await page.getByRole('menuitem', { name: /Item description \(synced\)/i }).click();

    // Editor swaps in: an item-description input + a save (check) action.
    await expect(page.getByRole('textbox', { name: /Item description/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('button', { name: /Save item description/i })).toBeVisible();

    await page.screenshot({ path: 'test-results/receiving-po-row-item-desc.png' });
  });
});
