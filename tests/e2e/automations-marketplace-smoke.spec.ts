import { test, expect } from '@playwright/test';

/**
 * `/automations` — the marketplace shell (Marketplace Phase 1) was built while
 * local auth was down, so nothing had ever driven it signed in. This is the
 * standing smoke: the page renders its three sections and each one's feed
 * answers, so an empty section means "nothing installed", never "the fetch
 * broke". Each section paints exactly one of: spinner → error copy → empty
 * state → rows; the assertions below reject the error copy specifically.
 */

const FEEDS = [
  '/api/automations',
  '/api/studio/templates',
  '/api/studio/catalog',
  '/api/integrations/composio/connections',
] as const;

test.describe('Automations marketplace', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the three sections render and their feeds answer', async ({ page }) => {
    test.setTimeout(90_000);

    for (const feed of FEEDS) {
      const res = await page.request.get(feed);
      expect(res.status(), `${feed} must not error`).toBeLessThan(400);
    }

    await page.goto('/automations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Automations', level: 1 })).toBeVisible({
      timeout: 45_000,
    });

    for (const section of ['Your automations', 'Discover', 'Connections']) {
      await expect(page.getByRole('heading', { name: section })).toBeVisible({ timeout: 20_000 });
    }

    // Discover is the marketplace's centre shelf: the system library alone is
    // enough to fill it, so an empty state here means the feed merge regressed.
    await expect(page.locator('svg.animate-spin')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('No blueprints available yet')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Install' }).first()).toBeVisible();

    // No section may be sitting on its fetch-failed copy.
    await expect(page.getByText(/Couldn’t load/)).toHaveCount(0);

    // The intent search box is the hero control, not decoration.
    await expect(page.getByPlaceholder('Describe what you want to automate…')).toBeVisible();
  });
});
