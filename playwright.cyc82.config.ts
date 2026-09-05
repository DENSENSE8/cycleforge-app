import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/**
 * CYC-82 runner — the base config MINUS `globalSetup`.
 *
 * `tests/e2e/global-setup.ts` re-mints the storage states on every run, and a
 * failed sign-in leaves `tests/.auth/*.json` cookieless, so a lane that already
 * had a good session loses it just by running one spec. This lane reads the
 * session it was given and never writes one:
 *
 *   PW_BASE_URL=http://localhost:3052 \
 *     npx playwright test -c playwright.cyc82.config.ts --project=qa-desktop
 *
 * The spec probes `/api/orders/queue-counts` and skips itself when that session
 * is absent, so an empty `tests/.auth` is a SKIP here, never a false red.
 */
export default defineConfig({
  ...base,
  globalSetup: undefined,
  testMatch: /cyc-82-.*\.spec\.ts/,
});
