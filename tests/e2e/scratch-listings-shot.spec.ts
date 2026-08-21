import { test, expect } from '@playwright/test';

test('header row: add left, delete all right', async ({ page }) => {
  await page.goto('/unbox?openReceivingId=7114&lineId=31663');
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 60_000 });
  const toggle = page.getByTestId('unbox-displays-pane-toggle');
  if ((await toggle.count()) > 0) await toggle.first().click();
  const col = page.getByTestId('receiving-displays-push');
  await expect(col).toBeVisible({ timeout: 20_000 });
  await expect(col.getByRole('button', { name: 'Add a listing link' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2000);

  for (const [name, href] of [
    ['Bose left speaker', 'https://shopgoodwill.com/item/111111111'],
    ['Sony receiver', 'https://www.ebay.com/itm/222222222222'],
  ]) {
    await col.getByRole('button', { name: 'Add a listing link' }).click();
    await col.getByPlaceholder('Name').first().fill(name);
    await col.getByPlaceholder('https://…').first().fill(href);
    await col.getByRole('button', { name: /^Save/ }).click();
    await expect(col.getByRole('button', { name: new RegExp(`^Edit ${name}`) })).toBeVisible({ timeout: 15_000 });
  }
  await page.waitForTimeout(500);
  await col.screenshot({ path: 'scratch-header-row.png' });

  const m = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="receiving-displays-push"]')!;
    const b = c.getBoundingClientRect();
    const px = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left - b.left), r: Math.round(r.right - b.left) };
    };
    const btn = (re: RegExp) =>
      Array.from(c.querySelectorAll('button')).find((x) => re.test(x.getAttribute('aria-label') || ''));
    const combo = c.querySelector('[aria-label="Selected listing link"]') as HTMLElement | null;
    const rowName = Array.from(c.querySelectorAll('button'))
      .find((x) => /^Open Sony receiver/.test(x.getAttribute('aria-label') || ''))
      ?.querySelector('span');
    return {
      plus: px(btn(/^Add a listing link/)),
      comboText: px(combo),
      copyAll: px(btn(/^Copy every listing/)),
      deleteAll: px(btn(/^Delete every listing/)),
      rowNameText: px(rowName),
      rowCopy: px(btn(/^Copy the URL for Sony receiver/)),
      rowDelete: px(btn(/^Delete Sony receiver/)),
    };
  });
  console.log('CELLS', JSON.stringify(m));

  // arm + confirm delete all
  await col.getByRole('button', { name: /^Delete every listing/ }).click();
  await page.waitForTimeout(200);
  await col.screenshot({ path: 'scratch-armed-delete.png' });
  await col.getByRole('button', { name: /^Confirm deleting all/ }).click();
  await expect(col.getByRole('button', { name: /^Edit Sony receiver/ })).toHaveCount(0, { timeout: 15_000 });
  console.log('DELETEALL ok');
});
