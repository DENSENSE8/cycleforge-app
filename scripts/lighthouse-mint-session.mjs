#!/usr/bin/env node
/**
 * Mint a session cookie for authenticated Lighthouse runs.
 *
 * Requires the target server (default http://localhost:3000) to be running
 * with AUTH_PINLESS_SIGNIN=true (or pass LH_STAFF_PIN). Mirrors the Playwright
 * global-setup pinless flow: staff-picker → signin with x-tenant-slug.
 *
 * Usage:
 *   node scripts/lighthouse-mint-session.mjs            # prints LH_COOKIE=cf_sid=…
 *   LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)" pnpm lighthouse:audit
 *
 * Env: LH_BASE_URL, LH_TENANT_SLUG (usav), LH_STAFF_NAME (Michael), LH_STAFF_PIN.
 */
const BASE_URL = process.env.LH_BASE_URL || 'http://localhost:3000';
const TENANT = process.env.LH_TENANT_SLUG || 'usav';
const STAFF_NAME = process.env.LH_STAFF_NAME || 'Michael';
const PIN = process.env.LH_STAFF_PIN;

const tenantHeaders = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };

async function main() {
  const pickerRes = await fetch(`${BASE_URL}/api/auth/staff-picker`, { headers: tenantHeaders });
  if (!pickerRes.ok) throw new Error(`staff-picker ${pickerRes.status}`);
  const picker = await pickerRes.json();
  const staffList = picker.staff ?? picker.staffList ?? picker;
  const staff = Array.isArray(staffList)
    ? staffList.find((s) => s.name === STAFF_NAME) ?? staffList[0]
    : null;
  if (!staff?.id) throw new Error(`no staff found (looked for "${STAFF_NAME}") — is the tenant slug right?`);

  const signinRes = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: 'POST',
    headers: tenantHeaders,
    body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal', ...(PIN ? { pin: PIN } : {}) }),
  });
  if (!signinRes.ok) {
    const body = await signinRes.text();
    throw new Error(
      `signin ${signinRes.status}: ${body.slice(0, 200)}\n` +
        `(is the server running with AUTH_PINLESS_SIGNIN=true, or pass LH_STAFF_PIN?)`,
    );
  }
  const setCookie = signinRes.headers.getSetCookie?.() ?? [signinRes.headers.get('set-cookie')];
  const sid = setCookie.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith('cf_sid='));
  if (!sid) throw new Error('signin succeeded but no cf_sid cookie in response');
  process.stdout.write(sid + '\n');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
