import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { DEFAULT_FOCUS_SCAN_HOTKEY } from '../../src/lib/schemas/staff-preferences';

/**
 * Unbox focus lock — the two rows of lane B's coverage table that survived the
 * capture stack's deletion.
 *
 * `.claude/rules/display/station.md` §3: a station that loses focus is a station
 * that drops scans. The keyboard wedge types into whatever is focused and ends
 * with Enter, so both of these are load-bearing and both are silent when they
 * break — the operator scans, nothing happens, and there is no error anywhere.
 *
 *  1. **Auto-refocus after submit.** `SerialCard.submit()` re-focuses the field
 *     on a 0ms defer so a multi-unit line takes serial after serial with no
 *     click between them.
 *  2. **The focus hotkey.** `src/lib/scan-hotkey/store.ts` — one global keydown
 *     listener, last-registered target wins — slams focus back to the station's
 *     scan bar from anywhere on the bench.
 *
 *     The key is read from `DEFAULT_FOCUS_SCAN_HOTKEY`, not typed here. Four
 *     rule files called this hotkey "F2" and the code has always defaulted to
 *     `Insert`; a spec that hardcodes the key just re-states the same guess and
 *     goes red the day someone rebinds it. Importing the constant makes this
 *     test track the binding instead of asserting a memory of it.
 *
 * Both assert on `document.activeElement`, which is the invariant — not on a
 * visible focus ring, which is a style that can change.
 *
 * The other three rows Plan B listed (back/forward, the multi-qty loop, the
 * 50-row scroll depth) asserted behavior of the mid-canvas capture stack. That
 * surface was rejected and deleted; the rows are out of scope, not pending.
 *
 * QA org only (`.claude/rules/verify.md`).
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-FOCUS-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-FC-${uniq()}`, item_name: 'Focus fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
}

/** Which element actually holds focus — the only honest focus assertion. */
function focusedMarker(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return 'none';
    if (el.hasAttribute('data-unbox-serial-input')) return 'serial';
    if (el.hasAttribute('data-station-scan-input')) return 'scan-bar';
    return el.tagName.toLowerCase();
  });
}

const serialInput = (page: Page) => page.locator('[data-unbox-serial-input]').first();
const scanBar = (page: Page) => page.locator('[data-station-scan-input]').first();

test.describe('unbox focus lock', () => {
  test('the wedge keeps the serial field focused across consecutive scans', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    const input = serialInput(page);
    await expect(input).toBeVisible({ timeout: 30_000 });

    // Two serials in a row, no click between them — that IS the wedge loop.
    // Values are deliberately not carrier-tracking-shaped: a tracking-looking
    // scan trips the wrong-barcode guard, which holds the value in the field on
    // purpose and would make this test assert the wrong thing.
    for (const serial of [`E2EFOCUSA${uniq()}`, `E2EFOCUSB${uniq()}`]) {
      await input.click();
      await input.fill(serial);
      await input.press('Enter');

      await expect
        .poll(() => focusedMarker(page), {
          timeout: 15_000,
          message: 'focus must return to the serial field after Enter',
        })
        .toBe('serial');
      // The field also clears, or the next scan appends to the last one.
      await expect.poll(() => input.inputValue(), { timeout: 15_000 }).toBe('');
    }
  });

  test('the focus hotkey returns focus to the scan bar from the work surface', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await expect(scanBar(page)).toBeVisible({ timeout: 30_000 });

    // Park focus somewhere that is NOT the bar — the state an operator is in
    // after touching anything on the bench.
    const input = serialInput(page);
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.click();
    await expect.poll(() => focusedMarker(page), { timeout: 15_000 }).toBe('serial');

    await page.keyboard.press(DEFAULT_FOCUS_SCAN_HOTKEY);

    await expect
      .poll(() => focusedMarker(page), {
        timeout: 15_000,
        message: `${DEFAULT_FOCUS_SCAN_HOTKEY} is the way back to the scan bar when focus has drifted`,
      })
      .toBe('scan-bar');
  });
});
