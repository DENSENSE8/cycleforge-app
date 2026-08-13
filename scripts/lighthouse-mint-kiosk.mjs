#!/usr/bin/env node
/**
 * Mint a `cf_kiosk` device cookie for authenticated Lighthouse runs of /kiosk*.
 *
 * Staff `lighthouse-mint-session.mjs` yields `cf_sid` and will measure the pair
 * screen on `/kiosk/v2`. This helper enrolls a tablet under a pinless staff
 * session, then pairs it (no staff cookie) so the cookie is the device principal.
 *
 * Usage:
 *   node scripts/lighthouse-mint-kiosk.mjs            # prints cf_kiosk=…
 *   LH_COOKIE="$(node scripts/lighthouse-mint-kiosk.mjs)" pnpm lighthouse:audit -- --routes /kiosk,/kiosk/v2 --desktop
 *
 * Env: LH_BASE_URL, LH_TENANT_SLUG (usav), LH_STAFF_NAME (Michael), LH_STAFF_PIN.
 * Requires AUTH_PINLESS_SIGNIN=true (or LH_STAFF_PIN) on the target server.
 */
const BASE_URL = process.env.LH_BASE_URL || 'http://localhost:3000';
const TENANT = process.env.LH_TENANT_SLUG || 'usav';
const STAFF_NAME = process.env.LH_STAFF_NAME || 'Michael';
const PIN = process.env.LH_STAFF_PIN;

const tenantHeaders = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };

function cookieFrom(res, name) {
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  return setCookie.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));
}

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
  const sid = cookieFrom(signinRes, 'cf_sid');
  if (!sid) throw new Error('signin succeeded but no cf_sid cookie in response');

  const enrollRes = await fetch(`${BASE_URL}/api/kiosk/enroll`, {
    method: 'POST',
    headers: { ...tenantHeaders, Cookie: sid },
    body: JSON.stringify({ label: `LH kiosk ${Date.now()}` }),
  });
  if (!enrollRes.ok) {
    const body = await enrollRes.text();
    throw new Error(`enroll ${enrollRes.status}: ${body.slice(0, 200)}`);
  }
  const enrollment = await enrollRes.json();
  const code = String(enrollment.code ?? '');
  if (code.length < 8) throw new Error('enroll succeeded but no pairing code');

  const pairRes = await fetch(`${BASE_URL}/api/kiosk/pair`, {
    method: 'POST',
    headers: tenantHeaders,
    body: JSON.stringify({ code }),
  });
  if (!pairRes.ok) {
    const body = await pairRes.text();
    throw new Error(`pair ${pairRes.status}: ${body.slice(0, 200)}`);
  }
  const kiosk = cookieFrom(pairRes, 'cf_kiosk');
  if (!kiosk) throw new Error('pair succeeded but no cf_kiosk cookie in response');
  process.stdout.write(kiosk + '\n');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
