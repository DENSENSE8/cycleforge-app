import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_TRACKING, QA_FIXTURE_PO_NUMBER } from '@/lib/tenancy/qa-org';

/**
 * Unbox tracking scan — the rail row must NEVER flash, and the middle must hydrate.
 *
 * ## What broke, and why a DOM-presence test is the only honest proof
 *
 * A tracking scan paints a pending rail row at t=0, before the carton exists.
 * That stub used to key on `scan:{tracking}` and the resolved carton on
 * `carton:{receiving_id}`, so resolving a scan CHANGED the row's React key.
 * A changed key is an unmount plus a mount, and the rail renders rows inside
 * `AnimatePresence` — so the operator watched their tracking number appear,
 * disappear, and come back. The row is now keyed on the SHIPMENT
 * (`stn:{tracking}`), which is the one identity that exists both before and
 * after the carton does, so stub → optimistic → authoritative is one element.
 *
 * Polling for visibility cannot catch this: the gap is a few frames, and an
 * `expect(...).toBeVisible()` between the two states passes either way. So this
 * spec installs a `MutationObserver` BEFORE the scan and records every rail-row
 * node added to or removed from the list. A flicker is then a recorded FACT —
 * a removal — not a timing guess.
 *
 * Runs on the QA org (`verify.md`: E2E asserts against QA_ORG_ID, never the
 * dogfood tenant). `QA_FIXTURE_TRACKING` is provisioned with a real
 * `shipping_tracking_numbers` row and `receiving_carton.shipment_id`, so the
 * scan resolves through the shipment join — the same "is it found?" switch the
 * operator's scan hits — rather than the STN-less legacy fallback.
 */

type RailEvent = { type: 'add' | 'remove'; key: string | null; text: string; seq: number };

declare global {
  interface Window {
    __railEvents?: RailEvent[];
  }
}

/**
 * Record rail-row adds/removes from before the scan until we read them back.
 *
 * Observes the whole document subtree rather than the rail list: the rail can
 * re-render its own container, and an observer bound to a node that is itself
 * replaced stops seeing anything — which would make this spec pass by going
 * blind, the worst failure mode a regression test can have.
 */
async function watchRailRows(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__railEvents = [];
    let seq = 0;
    const railRows = (nodes: NodeList): HTMLElement[] => {
      const out: HTMLElement[] = [];
      nodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches('[data-rail-row]')) out.push(n);
        out.push(...Array.from(n.querySelectorAll<HTMLElement>('[data-rail-row]')));
      });
      return out;
    };
    const record = (type: 'add' | 'remove', el: HTMLElement) => {
      window.__railEvents!.push({
        type,
        key: el.getAttribute('data-rail-key'),
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        seq: seq++,
      });
    };
    new MutationObserver((records) => {
      for (const r of records) {
        railRows(r.addedNodes).forEach((el) => record('add', el));
        railRows(r.removedNodes).forEach((el) => record('remove', el));
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

const canon = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

test.describe('Unbox tracking scan — rail continuity + middle hydration', () => {
  test('the scanned row never leaves the rail, and the carton hydrates in the middle', async ({
    page,
  }) => {
    await page.goto('/unbox');

    // Settle the rail BEFORE observing, so the first-paint cascade is not in the
    // recording. Anything the observer sees after this point belongs to the scan.
    const scanInput = page.getByPlaceholder(/Tracking, PO/i);
    await expect(scanInput).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);

    await watchRailRows(page);

    await scanInput.fill(QA_FIXTURE_TRACKING);
    await scanInput.press('Enter');

    // ── The middle must HYDRATE ────────────────────────────────────────────
    // Not merely "a workspace mounted" — the optimistic stub would satisfy that
    // while showing an empty unmatched pane. Wait for the carton's own PO
    // identity, which only the resolved + hydrated carton can render.
    const workspace = page.getByTestId('receiving-workspace');
    await expect(workspace).toBeVisible({ timeout: 30_000 });
    await expect(workspace.getByText(QA_FIXTURE_PO_NUMBER, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Let the authoritative `view=unbox_opened` refetch land too — a key change
    // there would flicker the row just as visibly as one at resolve time.
    await page.waitForTimeout(2_500);

    const events = (await page.evaluate(() => window.__railEvents ?? [])) as RailEvent[];

    // The pending stub is keyed on the shipment from its very first paint.
    const wanted = `stn:${canon(QA_FIXTURE_TRACKING)}`;
    const mine = events.filter((e) => e.key === wanted);

    expect(
      mine.length,
      `the scanned row never reached the rail — recorded: ${JSON.stringify(events)}`,
    ).toBeGreaterThan(0);

    // THE assertion. One add, no removes: the row was updated in place through
    // resolve + hydration + refetch. Any remove is the flicker, and the log says
    // exactly which key left so the failure names its own cause.
    const removed = mine.filter((e) => e.type === 'remove');
    expect(
      removed,
      `the scanned rail row was REMOVED mid-scan (the flicker). Recorded: ${JSON.stringify(mine)}`,
    ).toEqual([]);
    expect(mine.filter((e) => e.type === 'add')).toHaveLength(1);

    // And no legacy `scan:`/`carton:` twin was ever painted for this carton —
    // that would mean the key ladder disagreed with itself between producers,
    // which is the same defect wearing a second row instead of a gap.
    const twins = events.filter(
      (e) => e.type === 'add' && e.key !== wanted && e.text.includes(QA_FIXTURE_TRACKING),
    );
    expect(twins, `a second row was painted for the scanned tracking: ${JSON.stringify(twins)}`)
      .toEqual([]);

    // The row is still on screen at the end — presence, not just "never removed".
    await expect(page.locator(`[data-rail-key="${wanted}"]`).first()).toBeVisible();
  });
});
