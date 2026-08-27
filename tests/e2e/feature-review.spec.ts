/**
 * Feature-review capture — loop-only.
 *
 * Unset FEATURE_REVIEW_ROUTES and this file is a no-op, so
 * `npx playwright test` does not dump HUD screenshots on every local run.
 *
 * Viewport shots (not fullPage). The operator reads these on a phone; a
 * 15 000px scroll is not a HUD.
 *
 * Does not start a server. PW_BASE_URL (default http://localhost:3050) must
 * already be up — Cycle Forge AGENTS.md: the operator owns :3050.
 */
import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const routes = (process.env.FEATURE_REVIEW_ROUTES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => (s.startsWith('/') ? s : `/${s}`))
  .slice(0, 6);

const outDir = process.env.FEATURE_REVIEW_DIR || path.join('test-results', 'feature-review');

test.describe('feature review capture', () => {
  if (routes.length === 0) {
    test('loop-only', () => {
      test.skip(true, 'FEATURE_REVIEW_ROUTES unset — loop-only');
    });
    return;
  }

  for (const route of routes) {
    test(`capture ${route}`, async ({ page }, testInfo) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready).catch(() => undefined);
      const viewport = /mobile/i.test(testInfo.project.name) ? 'mobile' : 'desktop';
      const slug = route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
      await fs.promises.mkdir(outDir, { recursive: true });
      const dest = path.join(outDir, `${slug}-${viewport}.png`);
      await page.screenshot({ path: dest, fullPage: false });
    });
  }
});
