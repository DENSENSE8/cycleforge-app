import { chromium, request as pwRequest } from '@playwright/test';
import fs from 'fs';

// Ad-hoc screenshot loop: reuse the saved Playwright session so auth-gated
// routes render; if the session is stale, re-sign-in via the e2e auth helper
// (pinless API or owner act-as) and re-save it.
//   node tests/shot.mjs <path> <outfile>
const route = process.argv[2] || '/unbox';
const out = process.argv[3] || '/tmp/shot.png';
const STORAGE = 'tests/.auth/admin.json';
const STAFF = process.env.PW_STAFF_NAME || 'Michael';
const TENANT = process.env.PW_TENANT_SLUG || 'usav';
const baseURL = process.env.PW_BASE_URL || 'http://localhost:3000';

async function mintSession() {
  const req = await pwRequest.newContext({ baseURL });
  const picker = await req.get('/api/auth/staff-picker', {
    headers: { 'x-tenant-slug': TENANT },
  });
  if (!picker.ok()) throw new Error(`staff-picker failed: ${picker.status()}`);
  const { staff } = await picker.json();
  const row =
    staff?.find((s) => s.name.toLowerCase() === STAFF.toLowerCase()) ??
    staff?.find((s) => s.name.toLowerCase().includes(STAFF.toLowerCase()));
  if (!row) throw new Error(`Staff "${STAFF}" not found in ${TENANT}`);
  const signin = await req.post('/api/auth/signin', {
    headers: { 'x-tenant-slug': TENANT },
    data: { staffId: row.id, deviceKind: 'personal' },
  });
  if (!signin.ok()) throw new Error(`signin failed: ${signin.status()} ${await signin.text()}`);
  await req.storageState({ path: STORAGE });
  await req.dispose();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: fs.existsSync(STORAGE) ? STORAGE : undefined,
  baseURL,
  viewport: { width: 760, height: 520 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto(route, { waitUntil: 'networkidle' });

if (page.url().includes('/signin')) {
  await mintSession();
  const retryCtx = await browser.newContext({
    storageState: STORAGE,
    baseURL,
    viewport: { width: 760, height: 520 },
    deviceScaleFactor: 2,
  });
  const retryPage = await retryCtx.newPage();
  await retryPage.goto(route, { waitUntil: 'networkidle' });
  await retryPage.waitForTimeout(400);
  await retryPage.screenshot({ path: out });
  await browser.close();
  console.log(`shot -> ${out} (url: ${retryPage.url()})`);
  process.exit(0);
}

await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log(`shot -> ${out} (url: ${page.url()})`);