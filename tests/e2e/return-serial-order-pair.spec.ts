import { test, expect } from '@playwright/test';
import path from 'path';

const SHOT_DIR = path.join('docs', 'handoff', 'return-serial-order-pair');
const SERIAL = '080867J03430676AE';

test.describe('return serial pairs order id (QA org)', () => {
  test('three shots: unfound carton, serial entered, after scan', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/unbox', { waitUntil: 'commit', timeout: 15_000 });
    await page.waitForTimeout(8_000);
    await page.screenshot({ path: path.join(SHOT_DIR, '01-unfound-carton.png'), fullPage: true });

    await page.keyboard.type(SERIAL, { delay: 15 });
    await page.screenshot({ path: path.join(SHOT_DIR, '02-serial-entered.png'), fullPage: true });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-after-serial-scan.png'), fullPage: true });
    expect(page.url()).toMatch(/localhost:3077/);
  });
});
