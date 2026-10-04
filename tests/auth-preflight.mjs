/**
 * Auth preflight — one place that makes sure the saved Playwright admin session works at the
 * dev origin before a probe runs, and re-mints it when it does not.
 *
 * Session mining 2026-10-03: 302 sign-in bounces across 84 sessions, each discovered mid-probe.
 * Every live probe (route-tree smoke, live contracts, ad-hoc e2e scripts) calls ensureSession()
 * first; a session that cannot be minted is the probe's `no_data`, never a page failure.
 *
 *   node tests/auth-preflight.mjs            # exit 0 = signed in (re-minted if needed), 2 = cannot sign in
 *
 * Origin is :3050 (AGENTS.md §1) — the cookie scope the operator's browser uses.
 */
import fs from 'node:fs';
import { request as pwRequest } from '@playwright/test';

export const STORAGE = process.env.PW_STORAGE || 'tests/.auth/admin.json';
export const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STAFF = process.env.PW_STAFF_NAME || 'Michael';
const TENANT = process.env.PW_TENANT_SLUG || 'usav';

/** Sign in through the pinless staff API and save the cookies to `storage`. */
export async function mintSession({ baseURL = BASE_URL, storage = STORAGE } = {}) {
  const req = await pwRequest.newContext({ baseURL });
  try {
    const picker = await req.get('/api/auth/staff-picker', { headers: { 'x-tenant-slug': TENANT } });
    if (!picker.ok()) throw new Error(`staff-picker failed: ${picker.status()}`);
    const { staff } = await picker.json();
    const row =
      staff?.find((s) => s.name.toLowerCase() === STAFF.toLowerCase()) ??
      staff?.find((s) => s.name.toLowerCase().includes(STAFF.toLowerCase()));
    if (!row) throw new Error(`staff "${STAFF}" not found in ${TENANT}`);
    const signin = await req.post('/api/auth/signin', {
      headers: { 'x-tenant-slug': TENANT },
      data: { staffId: row.id, deviceKind: 'personal' },
    });
    if (!signin.ok()) throw new Error(`signin failed: ${signin.status()} ${await signin.text()}`);
    fs.mkdirSync(storage.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    await req.storageState({ path: storage });
  } finally {
    await req.dispose();
  }
}

/** Does the saved session reach `probePath` without a sign-in redirect? */
async function signedIn({ baseURL, storage, probePath }) {
  if (!fs.existsSync(storage)) return false;
  const req = await pwRequest.newContext({ baseURL, storageState: storage });
  try {
    const res = await req.get(probePath, { maxRedirects: 0, timeout: 45_000 });
    const location = res.headers()['location'] ?? '';
    return res.status() < 300 || (res.status() < 400 && !location.includes('/signin'));
  } catch {
    return false;
  } finally {
    await req.dispose();
  }
}

/**
 * @returns {Promise<{ ok: boolean, minted: boolean, error?: string }>}
 */
export async function ensureSession({ baseURL = BASE_URL, storage = STORAGE, probePath = '/m/stock' } = {}) {
  if (await signedIn({ baseURL, storage, probePath })) return { ok: true, minted: false };
  try {
    await mintSession({ baseURL, storage });
  } catch (err) {
    return { ok: false, minted: false, error: String(err?.message ?? err) };
  }
  return (await signedIn({ baseURL, storage, probePath }))
    ? { ok: true, minted: true }
    : { ok: false, minted: true, error: `minted a session but ${probePath} still redirects to sign-in` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ensureSession();
  process.stdout.write(`${JSON.stringify({ baseURL: BASE_URL, storage: STORAGE, ...result })}\n`);
  process.exit(result.ok ? 0 : 2);
}
