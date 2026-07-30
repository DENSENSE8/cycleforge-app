import { test, expect, type Page } from '@playwright/test';

/**
 * Ledger grid column display SoT — the four invariants the column model now owns.
 *
 * Guards the operator-visible half of the display contract that used to be
 * re-decided per surface (see `grid-column-display.guard.test.ts` for the
 * source half):
 *
 *   D1 zebra      — a ledger grid draws cell rules, so rows share ONE fill
 *   D2 alignment  — numeric tracks right-align; text/id/location left-align,
 *                   and the HEADER matches its cells
 *   D3 cell glyph — a typed header carries the type glyph; the cells below it
 *                   must not repeat it
 *   D4 header fit — a runtime-injected header label renders in full, never
 *                   clipped to `UNBO…`
 *
 * **Fold rows are asserted explicitly.** The first cut of this work migrated
 * leaf rows only, so `*GridGroupSummary` kept its duplicate tracking glyph and
 * the operator saw a map pin on fold rows and not on leaf rows in the same
 * column. A spec that only sampled leaf rows would have passed. Every assertion
 * below therefore runs over EVERY cell in the column, not a sample.
 *
 * Route-mocked and DB-independent (the `pending-grid-tanstack-tested` precedent)
 * so the shape is identical every run and no tenant's row mix can make an
 * assertion vacuous.
 */

const PO = '04-14955-01736';

/** One receiving line in the shape `/api/receiving-lines` returns. */
function line(i: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 990_000 + i,
    receiving_id: 990_000 + i,
    tracking_number: `95490154616762043${(10_000 + i).toString()}`,
    tracking_source: 'shipment',
    carrier: 'USPS',
    is_delivered: true,
    delivered_at: '2026-07-28 13:50:34.483609-07',
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: null,
    item_name: `E2E Ledger Row ${i}`,
    catalog_product_title: null,
    zoho_item_title: null,
    sku_catalog_id: null,
    sku: null,
    quantity_received: 1,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'DONE',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: false,
    is_priority: false,
    unboxed_at: `2026-07-28 1${i % 9}:20:00-07`,
    scanned_at: '2026-07-28 09:00:00-07',
    received_at: '2026-07-28 09:00:00-07',
    source_platform: 'eBay',
    ...overrides,
  };
}

/**
 * Fixture: 4 standalone lines + 3 lines sharing one PO so the grid renders a
 * COLLAPSED GROUP SUMMARY beside plain leaf rows — both row kinds in one view.
 */
const LINES = [
  ...[0, 1, 2, 3].map((i) => line(i)),
  ...[4, 5, 6].map((i) =>
    line(i, {
      zoho_purchaseorder_number: PO,
      zoho_purchaseorder_id: '77700123',
      tracking_number: '95490154616762045284',
    }),
  ),
];

async function mockLines(page: Page) {
  await page.route('**/api/receiving-lines**', async (route) => {
    const url = route.request().url();
    // Only the browse/activity feed is synthesised; rails and detail fetches
    // pass through so the page still boots normally.
    if (!url.includes('view=activity')) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, receiving_lines: LINES }),
    });
  });
}

/** Every rendered cell of one column, leaf rows AND fold summaries. */
function cells(page: Page, col: string) {
  return page.locator(`[data-col="${col}"]`);
}

test.describe('ledger grid column display SoT', () => {
  test.beforeEach(async ({ page }) => {
    await mockLines(page);
    await page.goto('/unbox?view=history');
    // The grid is virtualized; wait for a real value cell, not the shell.
    await expect(cells(page, 'title').first()).toBeVisible();
  });

  test('D1 — rows share one fill; no zebra banding', async ({ page }) => {
    const rows = page.locator('[data-line-row-id]');
    await expect.poll(async () => (await rows.count()) > 1).toBe(true);

    const fills = await rows.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundColor),
    );
    // The invariant is "one fill", not "not this specific gray" — any second
    // unselected background IS the stripe, whatever value someone reaches for.
    expect(new Set(fills).size).toBe(1);
  });

  test('D2 — every column is internally uniform, and numeric vs text resolve correctly', async ({ page }) => {
    // Read the columns that are ACTUALLY on screen rather than assuming a set.
    // Column visibility is a per-staff preference (`staff_preferences
    // .tableColumns`), so any column with a `hideKey` — `qty` included — can be
    // legitimately absent. Asserting against a hardcoded list makes this spec
    // fail for a staffer's saved view instead of for a real defect, which is
    // exactly what happened when the Fields-menu spec left `qty` toggled off.
    const byColumn = await page.evaluate(() => {
      const acc: Record<string, string[]> = {};
      document.querySelectorAll<HTMLElement>('[data-col]').forEach((el) => {
        const k = el.getAttribute('data-col')!;
        (acc[k] ??= []).push(getComputedStyle(el).justifyContent);
      });
      return acc;
    });

    const rendered = Object.keys(byColumn);
    expect(rendered.length, 'no columns rendered at all').toBeGreaterThan(2);

    // THE invariant, and it holds for whatever set is on screen: a column's
    // header and all of its cells resolve ONE justification. Header/cell
    // disagreement is the defect this SoT exists to remove.
    for (const [col, justifications] of Object.entries(byColumn)) {
      expect(
        new Set(justifications).size,
        `column "${col}" is not internally uniform: ${[...new Set(justifications)].join(' vs ')}`,
      ).toBe(1);
    }

    // And the type→align ruling, checked for whichever of these is present.
    const want: Record<string, string> = {
      title: 'flex-start', // text
      date: 'flex-start', // date
      qty: 'flex-end', // number
      order: 'flex-start', // id — a label made of digits, not a magnitude
      tracking: 'flex-start', // location — same
    };
    const checked = rendered.filter((c) => c in want);
    expect(checked.length, 'none of the known columns rendered').toBeGreaterThan(0);
    for (const col of checked) {
      expect(byColumn[col][0], `column "${col}" resolved the wrong alignment`).toBe(want[col]);
    }
  });

  test('D3 — the type glyph is drawn once in the header, never repeated per row', async ({ page }) => {
    const trackingCells = cells(page, 'tracking');
    const total = await trackingCells.count();
    expect(total).toBeGreaterThan(1);

    const withGlyph = await trackingCells.evaluateAll((els) =>
      els.filter((el) => el.querySelector('svg')).map((el) => el.textContent?.trim() ?? ''),
    );
    // Exactly one: the column header. Every value cell below it is glyph-free —
    // fold summaries included, which is the case that regressed.
    expect(withGlyph).toHaveLength(1);
    expect(withGlyph[0]?.toLowerCase()).toContain('tracking');
  });

  test('D4 — the runtime stage label renders in full, never clipped', async ({ page }) => {
    const header = page.locator('[role="row"]').first();
    await expect(header).toContainText(/UNBOXED/i);
    // The specific failure: a 4.5rem track showing `UNBO…`.
    await expect(header).not.toContainText('UNBO…');
    await expect(header).not.toContainText('UNBO...');

    // And the label must genuinely fit its track rather than being clipped by
    // overflow — measure, don't trust the string (verify.md: assert the invariant).
    const overflow = await header.evaluate((row) => {
      const cell = [...row.querySelectorAll<HTMLElement>('*')].find((el) =>
        /^UNBOXED$/i.test(el.textContent?.trim() ?? ''),
      );
      if (!cell) return null;
      return { scroll: cell.scrollWidth, client: cell.clientWidth };
    });
    expect(overflow, 'no UNBOXED header cell found').not.toBeNull();
    expect(overflow!.scroll).toBeLessThanOrEqual(overflow!.client + 1);
  });

  test('D4b — no header clips WHILE SORTED, and geometry is constant', async ({ page }) => {
    // The gap that let `UNBO…` ship twice: D4 only ever checked the IDLE header.
    // A sorted header used to draw the type glyph AND a chevron, needing a third
    // rem the track did not have. The header now reuses ONE mark slot, so this
    // asserts both halves — nothing clips, and the width does not move.
    const header = () => page.locator('[role="columnheader"]');
    const measure = () =>
      header().evaluateAll((els) =>
        els.map((el) => {
          const label = [...el.querySelectorAll('span')].find(
            (s) => !(s.className || '').includes('sr-only') && (s.textContent ?? '').trim(),
          );
          return {
            col: el.getAttribute('data-col') ?? '',
            width: Math.round(el.getBoundingClientRect().width),
            marks: el.querySelectorAll('svg').length,
            clipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
          };
        }),
      );

    const before = await measure();
    expect(before.length).toBeGreaterThan(3);

    // Sort each sortable column in turn; a clip only appears in the sorted state.
    for (const { col } of before) {
      if (!col || col === 'select') continue;
      const cell = page.locator(`[role="columnheader"][data-col="${col}"]`).first();
      if (!(await cell.count())) continue;
      await cell.click();
      await page.waitForTimeout(120);

      const now = await measure();
      for (const cell of now) {
        expect(cell.clipped, `header "${cell.col}" clipped while "${col}" is sorted`).toBe(false);
        // Exactly one mark in every state — the chevron REPLACES the type glyph
        // rather than joining it, which is what keeps the width constant.
        expect(cell.marks, `header "${cell.col}" drew ${cell.marks} marks`).toBeLessThanOrEqual(1);
      }
      // Sorting must not reflow the track widths.
      expect(now.map((c) => c.width)).toEqual(before.map((c) => c.width));
    }
  });

  test('fold rows obey the same contract as leaf rows', async ({ page }) => {
    // The regression this spec exists for: a grouped PO renders a SUMMARY row,
    // which is a different component and was missed by the first migration.
    const summary = page.locator(`text=${PO}`).first();
    await expect(summary).toBeVisible();

    const row = summary.locator('xpath=ancestor::*[.//*[@data-col="tracking"]][1]');
    const trackingCell = row.locator('[data-col="tracking"]').first();
    await expect(trackingCell).toBeVisible();
    expect(await trackingCell.locator('svg').count()).toBe(0);
    expect(await trackingCell.evaluate((el) => getComputedStyle(el).justifyContent)).toBe('flex-start');
  });
});
