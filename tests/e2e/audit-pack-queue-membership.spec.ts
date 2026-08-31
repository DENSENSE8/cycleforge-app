import { test, expect } from '@playwright/test';

/**
 * AUDIT — does a tested order (serial attached at Testing) actually reach the
 * ready-to-pack queue? Checked the way an operator would: the pack station's
 * own search box, plus the network payload the queue itself renders from.
 */

const ORDER = process.env.AUDIT_ORDER || '22-14547-57454';

// DIAGNOSTIC against QA org — CF-04 queue exclusion is order-grain in
// `order-grain-sql.ts` (CI-gated). This probe validates a named AUDIT_ORDER.
// Opt in: AUDIT_DIAGNOSTIC=1.
test.skip(process.env.AUDIT_DIAGNOSTIC !== '1', 'diagnostic probe — set AUDIT_DIAGNOSTIC=1 to run');

test('Pack queue membership for a tested order', async ({ page }) => {
  // Capture the queue's own data payload so membership is judged on the server
  // response, not on virtualized DOM.
  const payloads: { url: string; count: number; hasOrder: boolean; testedCount: number }[] = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/') || !r.ok()) return;
    if (!/orders|unshipped|queue/i.test(u)) return;
    try {
      const j = await r.json();
      const rows: any[] = Array.isArray(j) ? j : (j.orders ?? j.data ?? j.rows ?? []);
      if (!Array.isArray(rows) || rows.length === 0) return;
      payloads.push({
        url: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110),
        count: rows.length,
        hasOrder: rows.some((o) => o?.order_id === ORDER),
        testedCount: rows.filter((o) => o?.has_tech_scan).length,
      });
    } catch {
      /* non-JSON */
    }
  });

  await page.goto('/pack');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  console.log('\n===== QUEUE PAYLOADS (default view) =====');
  console.log(JSON.stringify(payloads, null, 2));

  // Now use the station's own search — the operator's actual affordance.
  const search = page.getByRole('searchbox').or(page.locator('input[type="search"]')).first();
  let searched = false;
  if (await search.count()) {
    await search.click();
    await search.fill(ORDER);
    await page.waitForTimeout(3500);
    searched = true;
  } else {
    // Search is an always-open find field — type into it.
    const toggle = page.getByRole('button', { name: /search/i }).first();
    if (await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(500);
      const inner = page.locator('input[type="search"], input[type="text"]').first();
      if (await inner.count()) {
        await inner.fill(ORDER);
        await page.waitForTimeout(3500);
        searched = true;
      }
    }
  }
  console.log(`\n===== searched via station UI: ${searched} =====`);
  await page.screenshot({ path: 'test-results/audit-pack-03-search.png', fullPage: true });

  const visibleAfterSearch = await page.getByText(ORDER, { exact: false }).count();
  console.log(`===== "${ORDER}" visible after station search: ${visibleAfterSearch} =====`);

  console.log('\n===== ALL PAYLOADS (incl. search) =====');
  console.log(JSON.stringify(payloads, null, 2));

  expect(
    payloads.some((p) => p.hasOrder) || visibleAfterSearch > 0,
    `tested order ${ORDER} must be reachable from the pack station`,
  ).toBeTruthy();
});
