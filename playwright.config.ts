import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Load local secrets + photo/GCS config for E2E (same .env as `pnpm dev`).
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Default to THIS worktree's dev port so E2E in a lane (e.g. cycleforge-fba:3020)
// hits its own dev server, not main's :3000. Reuse the SoT resolver via its CLI
// (Playwright transpiles this config to CJS and can't require the ESM .mjs).
// PW_BASE_URL still overrides everything.
function worktreePort(): string {
  try {
    return execSync('node scripts/dev-worktree-port.mjs', {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim() || '3000';
  } catch {
    return '3000';
  }
}
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${worktreePort()}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'tests/.auth/admin.json',
  },

  globalSetup: require.resolve('./tests/e2e/global-setup'),

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'qa-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/qa-admin.json',
      },
    },
  ],
});
