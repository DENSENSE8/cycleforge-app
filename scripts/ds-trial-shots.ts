import { chromium, request as pwRequest } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { TRIAL_NAMES, type TrialName } from '../packages/design-tokens/src/index';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = path.resolve('tests/.auth/admin.json');
const TENANT = process.env.PW_TENANT_SLUG || 'usav';
const STAFF = process.env.PW_STAFF_NAME || 'Ajax';
const ALL_VIEWPORTS = [
  { name: 'desk-1440x900', width: 1440, height: 900, isMobile: false },
  { name: 'phone-390x844', width: 390, height: 844, isMobile: false },
] as const;
const VIEWPORTS = process.env.PW_VIEWPORT
  ? ALL_VIEWPORTS.filter((viewport) => viewport.name.startsWith(process.env.PW_VIEWPORT!))
  : ALL_VIEWPORTS;

function routeSlug(route: string): string {
  const pathname = new URL(route, BASE_URL).pathname.replace(/^\//, '').replace(/\//g, '-') || 'root';
  return pathname.replace(/[^a-zA-Z0-9_-]/g, '-') || 'root';
}

async function mintSession(output: string): Promise<void> {
  const request = await pwRequest.newContext({ baseURL: BASE_URL });
  try {
    let picker = await request.get('/api/auth/staff-picker', { headers: { 'x-tenant-slug': TENANT } });
    for (let attempt = 1; attempt < 3 && !picker.ok(); attempt += 1) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 500 * attempt);
      await promise;
      picker = await request.get('/api/auth/staff-picker', { headers: { 'x-tenant-slug': TENANT } });
    }
    if (!picker.ok()) throw new Error(`staff-picker failed: ${picker.status()}`);
    const { staff } = await picker.json();
    const row =
      staff?.find((candidate: { name: string }) => candidate.name.toLowerCase() === STAFF.toLowerCase()) ??
      staff?.find((candidate: { name: string }) => candidate.name.toLowerCase().includes(STAFF.toLowerCase()));
    if (!row) throw new Error(`Staff "${STAFF}" not found in ${TENANT}`);
    const signin = await request.post('/api/auth/signin', {
      headers: { 'x-tenant-slug': TENANT },
      data: { staffId: row.id, deviceKind: 'personal' },
    });
    if (!signin.ok()) throw new Error(`signin failed: ${signin.status()} ${await signin.text()}`);
    await request.storageState({ path: output });
  } finally {
    await request.dispose();
  }
}

async function capture(route: string, trial: string | null, viewport: (typeof VIEWPORTS)[number], output: string, storage: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const phone = viewport.name.startsWith('phone-');
    const context = await browser.newContext({
      storageState: storage,
      viewport: phone ? { width: 1440, height: 900 } : { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      deviceScaleFactor: 1,
      baseURL: BASE_URL,
    });
    const page = await context.newPage();
    const target = trial ? `${route}${route.includes('?') ? '&' : '?'}trial=${encodeURIComponent(trial)}` : route;
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    if (page.url().includes('/signin')) {
      await context.close();
      await browser.close();
      const refreshed = path.join('/tmp', `cycleforge-trial-admin-${process.pid}.json`);
      await mintSession(refreshed);
      return capture(route, trial, viewport, output, refreshed);
    }
    await page.waitForSelector('[data-ledger-open]', { state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(1_500);
    if (trial) {
      const applied = await page.locator('html').getAttribute('data-trial');
      if (!applied) throw new Error(`Trial "${trial}" did not reach <html> on ${page.url()}`);
    }
    if (phone) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: output, fullPage: false });
    console.log(`${trial ? 'after' : 'before'} ${viewport.name} -> ${output}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const [trial, ...routes] = process.argv.slice(2);
  const isBaseline = trial === 'baseline';
  if (!trial || routes.length === 0 || (!isBaseline && !TRIAL_NAMES.includes(trial.split(',')[0] as TrialName))) {
    throw new Error(`Usage: pnpm ds:trial-shots <trial> <route...> (trial: ${TRIAL_NAMES.join(', ')})`);
  }

  const storage = existsSync(STORAGE) ? STORAGE : path.join('/tmp', `cycleforge-trial-admin-${process.pid}.json`);
  if (!existsSync(storage)) await mintSession(storage);

  for (const route of routes) {
    const dir = path.join('docs/design-system/trials', trial, routeSlug(route));
    await mkdir(dir, { recursive: true });
    for (const viewport of VIEWPORTS) {
      await capture(route, null, viewport, path.join(dir, `before-${viewport.name}.png`), storage);
      await capture(route, isBaseline ? null : trial, viewport, path.join(dir, `after-${viewport.name}.png`), storage);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
