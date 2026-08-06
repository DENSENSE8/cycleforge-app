import { test, expect, type Page } from '@playwright/test';

/**
 * Unbox History · Law of Strict Alignment — live DOM measurement.
 *
 * Text/IDs (order · title · tracking) start-align; magnitudes (date · qty · price)
 * end-align. Headers must match body. Column sequence is out of scope.
 */

type Edge = 'start' | 'end' | 'other';

function edgeFromJustify(justify: string, textAlign: string): Edge {
  if (justify.includes('flex-end') || justify === 'end' || textAlign === 'right') return 'end';
  if (justify.includes('flex-start') || justify === 'start' || textAlign === 'left') return 'start';
  return 'other';
}

async function openUnboxHistory(page: Page) {
  // Default Unbox tab is History (`unboxview` absent).
  await page.goto('/unbox');
  await expect(page.getByTestId('receiving-grid-body')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-col="order"]').first()).toBeVisible({ timeout: 30_000 });
}

async function measureCol(page: Page, key: string) {
  return page.evaluate((colKey) => {
    const cell = document.querySelector(`[data-col="${colKey}"]`) as HTMLElement | null;
    const header =
      (document.querySelector(`[data-grid-col="${colKey}"]`) as HTMLElement | null) ||
      (document.querySelector(`[role="columnheader"][data-col="${colKey}"]`) as HTMLElement | null) ||
      Array.from(document.querySelectorAll('[role="columnheader"]')).find((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        const map: Record<string, string> = {
          order: 'order',
          date: 'date',
          title: 'product',
          qty: 'qty',
          price: 'price',
          tracking: 'tracking',
        };
        return t.includes(map[colKey] || colKey);
      }) as HTMLElement | undefined;

    const styleOf = (el: HTMLElement | null | undefined) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        className: el.className,
        justifyContent: cs.justifyContent,
        textAlign: cs.textAlign,
        display: cs.display,
      };
    };

    const contentPos = (() => {
      if (!cell) return null;
      const child = cell.firstElementChild as HTMLElement | null;
      if (!child) return null;
      const c = cell.getBoundingClientRect();
      const k = child.getBoundingClientRect();
      const leftGap = k.left - c.left;
      const rightGap = c.right - k.right;
      return {
        leftGap: Math.round(leftGap * 10) / 10,
        rightGap: Math.round(rightGap * 10) / 10,
        sits: leftGap + 2 < rightGap ? 'start' : rightGap + 2 < leftGap ? 'end' : 'center',
      };
    })();

    return {
      cell: styleOf(cell),
      header: styleOf(header ?? null),
      contentPos,
      cellHtml: cell?.outerHTML?.slice(0, 280) ?? null,
    };
  }, key);
}

test.describe('Unbox History · Strict Alignment', () => {
  test('ORDER/TRACKING start; DATE/QTY/PRICE end — measured in the live DOM', async ({ page }) => {
    await openUnboxHistory(page);

    await page.screenshot({
      path: 'test-results/unbox-history-strict-align.png',
      fullPage: false,
    });

    const keys = ['date', 'order', 'title', 'qty', 'price', 'tracking'] as const;
    const want: Record<(typeof keys)[number], Edge> = {
      date: 'end',
      order: 'start',
      title: 'start',
      qty: 'end',
      price: 'end',
      tracking: 'start',
    };

    const report: Record<string, unknown> = {};
    for (const key of keys) {
      const m = await measureCol(page, key);
      report[key] = m;
      expect(m.cell, `${key} cell missing`).toBeTruthy();
      const edge = edgeFromJustify(m.cell!.justifyContent, m.cell!.textAlign);
      expect(edge, `${key} cell justify=${m.cell!.justifyContent} text=${m.cell!.textAlign} class=${m.cell!.className}`).toBe(
        want[key],
      );
      if (m.contentPos && m.contentPos.sits !== 'center') {
        expect(
          m.contentPos.sits,
          `${key} content sits ${m.contentPos.sits} (leftGap=${m.contentPos.leftGap} rightGap=${m.contentPos.rightGap})`,
        ).toBe(want[key]);
      }
    }

    // eslint-disable-next-line no-console
    console.log('STRICT_ALIGN_REPORT', JSON.stringify(report, null, 2));
  });
});
