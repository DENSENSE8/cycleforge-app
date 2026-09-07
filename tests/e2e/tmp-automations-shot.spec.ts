import { test, expect } from '@playwright/test';

/** TEMPORARY: capture + diagnose the /automations surface for handoff task F. */

test('shot: /automations live', async ({ page }) => {
  test.setTimeout(120_000);

  const seen: string[] = [];
  page.on('response', (res) => {
    const u = new URL(res.url()).pathname;
    if (
      u === '/api/automations' ||
      u === '/api/studio/catalog' ||
      u === '/api/integrations/composio/connections'
    ) {
      seen.push(`${u} → ${res.status()}`);
    }
  });

  await page.goto('/automations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Automations', level: 1 })).toBeVisible({
    timeout: 45_000,
  });

  // Every section must LEAVE its spinner — a permanent spinner is a broken feed.
  await expect(page.locator('svg.animate-spin')).toHaveCount(0, { timeout: 30_000 });
  console.log(`[verify] feed responses: ${seen.join(' · ') || 'NONE OBSERVED'}`);

  await page.addStyleTag({ content: '[data-design-lab-hud]{display:none !important}' });
  await page.screenshot({ path: 'tests/.artifacts/task-f-1-automations-top.png' });
  await page.getByRole('heading', { name: 'Connections' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/.artifacts/task-f-2-automations-connections.png' });
});
