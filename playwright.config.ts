import path from 'path';
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Load local secrets + photo/GCS config for E2E (same .env as `pnpm dev`).
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// The repo's dev port. Matches `pnpm dev`, `.claude/launch.json` and
// `dev-tunnel-named.mjs` — :3000 belongs to another app on this machine, which is
// why the whole repo sits on :3050.
//
// This used to shell out to a per-worktree port resolver so a lane could run its
// own dev server. That resolver answered 3000 for main while everything else here
// answered 3050, so E2E in the main checkout pointed at a port with nothing on it
// unless you remembered PW_BASE_URL. One port, no resolution.
// PW_BASE_URL still overrides everything.
const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';

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
