/** Pure staff WebAuthn RP / origin allowlist helpers (no DB). */

const DEFAULT_STAFF_APP_HOSTNAME = 'app.cycleforge.ai';

/** Staff app hostname used as WebAuthn rpID (parent of `{slug}.app…`). */
export function staffWebAuthnRpId(envOrigin?: string | null): string {
  const raw = String(envOrigin ?? '').trim().replace(/\/+$/, '');
  if (raw) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_STAFF_APP_HOSTNAME;
}

/**
 * Whether `host` may present staff passkeys for `rpID`.
 * Apex (`app.cycleforge.ai`) and `{slug}.app.cycleforge.ai` yes;
 * kiosk hosts (`{slug}.kiosk.app…`) and unrelated hosts no.
 */
export function isStaffWebAuthnHost(host: string, rpID: string): boolean {
  const h = String(host ?? '').trim().toLowerCase().split(':')[0] ?? '';
  const rp = String(rpID ?? '').trim().toLowerCase();
  if (!h || !rp) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) {
    return rp === 'localhost' || rp.endsWith('.localhost');
  }
  if (h === rp) return true;
  if (!h.endsWith(`.${rp}`)) return false;
  const prefix = h.slice(0, -(rp.length + 1));
  // One label only — rejects `usav.kiosk.app.cycleforge.ai` when rp is `app.cycleforge.ai`.
  if (!prefix || prefix.includes('.')) return false;
  return /^[a-z0-9-]+$/.test(prefix);
}

/**
 * Origins SimpleWebAuthn should accept for this request.
 * Parent rpID so one Face ID works on apex and every `{slug}.app…` tenant.
 */
export function staffWebAuthnExpectedOrigins(opts: {
  requestOrigin: string;
  envOrigin?: string | null;
}): { rpID: string; origin: string; expectedOrigins: string[] } {
  const reqOrigin = String(opts.requestOrigin ?? '').replace(/\/+$/, '');
  const envOrigin = String(opts.envOrigin ?? '').trim().replace(/\/+$/, '');
  const rpID = staffWebAuthnRpId(envOrigin || reqOrigin);
  const apexOrigin =
    envOrigin ||
    (rpID === 'localhost' || rpID.endsWith('.localhost') ? reqOrigin : `https://${rpID}`);

  let reqHost = '';
  try {
    reqHost = new URL(reqOrigin).hostname.toLowerCase();
  } catch {
    reqHost = '';
  }

  const expected = new Set<string>();
  if (reqOrigin && isStaffWebAuthnHost(reqHost, rpID)) expected.add(reqOrigin);
  if (apexOrigin) {
    try {
      const apexHost = new URL(apexOrigin).hostname.toLowerCase();
      if (isStaffWebAuthnHost(apexHost, rpID)) expected.add(apexOrigin);
    } catch {
      /* ignore bad env */
    }
  }
  if (expected.size === 0 && apexOrigin) expected.add(apexOrigin);

  const origin = expected.has(reqOrigin) ? reqOrigin : ([...expected][0] ?? reqOrigin);
  return { rpID, origin, expectedOrigins: [...expected] };
}

/** True when the body claims Face ID without a WebAuthn assertion. */
export function isUnsignedQrVerifiedClaim(body: Record<string, unknown>): boolean {
  return body.verified === true && body.response == null;
}
