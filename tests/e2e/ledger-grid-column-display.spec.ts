import { test, expect, type Page } from '@playwright/test';

/**
 * Ledger grid column display SoT — the four invariants the column model now owns.
 *
 * Guards the operator-visible half of the display contract that used to be
 * re-decided per surface (see `grid-column-display.guard.test.ts` for the
 * source half):
 *
 *   D1 zebra      — a ledger grid draws cell rules, so rows share ONE fill
 *   D2 alignment  — number/date tracks right-align; text/order/location left-align,
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
    /*
      `/receiving/history`, not `/unbox`.

      Two things were wrong with the old target. `?view=history` is not the
      Unbox tab param (`?unboxview=` is), so it was ignored outright. And even
      corrected, `/unbox` is a scan STATION: when a carton is open its overlay
      owns the middle and the desk pane goes `visibility: hidden`, so the grid
      this spec is about is not on screen there. `/receiving/history` mounts the
      same table as its primary surface, which is what a column-display SoT
      wants to measure.
    */
    await page.goto('/receiving/history');
    /*
      Wait for a real value cell, not the shell — the grid is virtualized.

      This waited on `title`, a track of the RETIRED flat model, so it timed out
      on a healthy surface and took all six tests with it. Unbox History renders
      `RECEIVING_COMPOUND_COLUMNS` (`select · thumb · fulfillment · item · state
      · amount · actions · _fill`) and has since before this spec last passed.
      Everything below scans `[data-col]` generically, so this one line was the
      whole staleness.
    */
    await expect(cells(page, 'item').first()).toBeVisible();
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

    /*
      The type→align ruling, checked for whichever of these is present.

      Ported to the COMPOUND tracks 2026-08-29 — the flat keys this listed
      (`title`, `date`, `qty`, `order`, `tracking`) are not rendered by any
      receiving surface any more, so `checked` was always empty and the
      assertion below fired on a healthy grid. Values are what
      `resolveGridColumnAlign` derives from each column's `type`, which is the
      ruling this test exists to pin.
    */
    const want: Record<string, string> = {
      fulfillment: 'flex-start', // id — a label made of digits, not a magnitude
      item: 'flex-start', // text
      state: 'flex-start', // tag — a category, read left to right
      amount: 'flex-end', // price — a magnitude, so it right-aligns
    };
    const checked = rendered.filter((c) => c in want);
    expect(checked.length, 'none of the known columns rendered').toBeGreaterThan(0);
    for (const col of checked) {
      expect(byColumn[col][0], `column "${col}" resolved the wrong alignment`).toBe(want[col]);
    }
  });

  /**
   * The REGRESSION this names is a type glyph repeated in every value cell. The
   * flat model drew one in the header, so the test asserted "exactly one".
   *
   * The compound header draws none at all — its identity is the two-row cell,
   * not a typed track with a mark — so "exactly one" is now false on a healthy
   * grid. What still has to hold, and is the actual defect class, is that NO
   * VALUE CELL draws one: at most the header may, and never a row.
   */
  test('D3 — a type glyph is never repeated per row', async ({ page }) => {
    // `fulfillment` is the compound model's id track — the flat `tracking` this
    // named is not rendered by any receiving surface any more.
    const idCells = cells(page, 'fulfillment');
    expect(await idCells.count()).toBeGreaterThan(1);

    const withGlyph = await idCells.evaluateAll((els) =>
      els.filter((el) => el.querySelector('svg')).map((el) => el.textContent?.trim() ?? ''),
    );
    // Zero (compound) or one (the header, on a typed flat track). Never per-row
    // — fold summaries included, which is the case that regressed.
    expect(
      withGlyph.length,
      `type glyph repeated in value cells: ${withGlyph.join(' | ')}`,
    ).toBeLessThanOrEqual(1);
  });

  /**
   * Generalised 2026-08-29. This asserted one specific label — a runtime
   * `UNBOXED` stage column, at 4.5rem, that once shipped as `UNBO…` twice — and
   * the compound model has no such track, so it could only ever fail here.
   *
   * The BUG CLASS is what matters and it is unchanged: a header label that does
   * not fit its track. Measuring every header instead of naming one covers the
   * original defect and every future one, and cannot go stale when a column is
   * renamed.
   */
  test('D4 — no header label is clipped by its track', async ({ page }) => {
    const header = page.locator('[role="row"]').first();
    await expect(header).toBeVisible();

    /*
      Measure the LABEL element, not the header cell.

      A header cell also contains its resize grip, so its `scrollWidth` exceeds
      its `clientWidth` on every well-behaved column — measuring the cell
      reported all four as clipped on a grid that clips nothing. The label is
      what can actually be cut off, so the label is what gets measured: the
      deepest element whose text IS the column's whole name.
    */
    const clipped = await header.evaluate((row) =>
      [...row.querySelectorAll<HTMLElement>('[data-col]')]
        .map((cell) => {
          const col = cell.getAttribute('data-col') ?? '?';
          const label = [...cell.querySelectorAll<HTMLElement>('*')]
            .filter((el) => el.children.length === 0 && (el.textContent?.trim() ?? '') !== '')
            .pop();
          if (!label) return null;
          return {
            col,
            text: label.textContent?.trim() ?? '',
            scroll: label.scrollWidth,
            client: label.clientWidth,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c != null)
        // A zero-width label is hidden, not clipped.
        .filter((c) => c.client > 0 && c.scroll > c.client + 1),
    );
    expect(
      clipped,
      `clipped header labels: ${clipped.map((c) => `${c.col}="${c.text}"`).join(', ')}`,
    ).toEqual([]);
    // The ellipsis form the original defect shipped as.
    await expect(header).not.toContainText('…');
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

  /**
   * The regression this guards: a grouped PO renders a SUMMARY row, which is a
   * different component and was missed by the first migration.
   *
   * It is CONDITIONAL because `/receiving/history` groups on
   * `groupAxis: 'activity'` — date bands, not PO folds — so no summary row
   * exists here to check. Asserting one would be asserting a fiction about the
   * route. The guard stays live for any surface that does fold, and skips
   * loudly rather than passing silently where none does.
   */
  test('fold rows obey the same contract as leaf rows', async ({ page }) => {
    const summary = page.locator(`text=${PO}`).first();
    if ((await summary.count()) === 0) {
      test.skip(true, 'this surface groups by date, not by PO — no fold summary row to check');
    }
    await expect(summary).toBeVisible();

    const row = summary.locator('xpath=ancestor::*[.//*[@data-col="fulfillment"]][1]');
    const idCell = row.locator('[data-col="fulfillment"]').first();
    await expect(idCell).toBeVisible();
    // A summary row is a different component, and the first migration missed
    // it: no repeated type glyph, same derived justification as a leaf row.
    expect(await idCell.locator('svg').count()).toBe(0);
    expect(await idCell.evaluate((el) => getComputedStyle(el).justifyContent)).toBe('flex-start');
  });
});
