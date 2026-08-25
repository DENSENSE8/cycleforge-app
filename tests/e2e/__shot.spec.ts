import { test } from '@playwright/test';
const SURFACES = [
  { name: 'unbox', path: '/unbox', row: '[data-line-row-id]' },
  { name: 'incoming', path: '/incoming', row: '[data-line-row-id]' },
  { name: 'toship', path: '/shipping/orders', row: '[data-order-row-id]' },
  { name: 'tasks', path: '/?mode=tasks', row: '[data-staff-task-id]' },
];
for (const s of SURFACES) {
  test(`shot ${s.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(s.path);
    const cell = page.locator(`${s.row} [data-col="item"]`).first();
    const ok = await cell.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false);
    if (!ok) { console.log(`SKIP ${s.name}`); return; }
    // tick the first row so the selected face is visible beside unselected ones
    const box = page.locator(`${s.row} [data-col="select"] [role="checkbox"]`).first();
    if (await box.count()) { await box.click({ force: true }).catch(() => {}); }
    await page.waitForTimeout(600);
    const b = (await page.locator(s.row).first().boundingBox())!;
    const geo = await page.evaluate((rowSel) => {
      const row = document.querySelector(rowSel) as HTMLElement;
      const g = (k: string) => {
        const el = row.querySelector(`[data-col="${k}"]`) as HTMLElement;
        if (!el) return null;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { w: Math.round(r.width), h: Math.round(r.height), pad: [cs.paddingLeft, cs.paddingTop] };
      };
      return { select: g('select'), thumb: g('thumb') };
    }, s.row);
    console.log(`GEO ${s.name} ` + JSON.stringify(geo));
    await page.screenshot({ path: `test-results/gutter-${s.name}.png`, clip: { x: b.x, y: b.y, width: Math.min(b.width, 820), height: b.height * 5 } });
  });
}
