import { test } from '@playwright/test';

/** THROWAWAY — carton context header on /unbox: trace the copy receipt. */
test('unbox carton header chip copy trace', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const t0 = Date.now();
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[TT]')) console.log(`${String(Date.now() - t0).padStart(6)}ms ${t}`);
  });

  await page.goto('/unbox');
  await page.waitForTimeout(7000);
  await page.locator('aside button').first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const header = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-chip-face]'))
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { text: (n.textContent || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((c) => c.y < 90);
  });
  console.log('header chips:', JSON.stringify(header));
  if (!header.length) {
    await page.screenshot({ path: 'unbox-none.png' });
    return;
  }

  const sample = async (tag: string) => {
    const info = await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll('div.bg-surface-inverse')).find((x) => x.querySelector('span.font-mono'));
      return n
        ? {
            text: (n.querySelector('span.font-mono')?.textContent || '').trim(),
            check: !!n.querySelector('.text-emerald-400'),
            vis: (n.parentElement as HTMLElement | null)?.style.visibility ?? '',
          }
        : null;
    });
    console.log(`${String(Date.now() - t0).padStart(6)}ms ${tag} ${JSON.stringify(info)}`);
  };

  const target = header[header.length - 1];
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  console.log('--- hover header chip', JSON.stringify(target));
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(500);
  await sample('hovered');
  console.log('--- click ---');
  await page.mouse.down();
  await page.mouse.up();
  for (let i = 1; i <= 12; i += 1) {
    await page.waitForTimeout(250);
    await sample(`t+${String(i * 250).padStart(4)}`);
  }
  await page.screenshot({ path: 'unbox-click.png' });
});
