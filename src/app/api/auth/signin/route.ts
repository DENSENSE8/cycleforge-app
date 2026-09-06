/**
 * POST /api/auth/signin
 *
 * Body: { staffId: number, pin?: string, deviceKind?: 'station' | 'personal',
 *         deviceLabel?: string, persistent?: boolean }
 *
 * `persistent` is the sign-in page's "Keep me signed in" checkbox. True keeps
 * the session alive with no idle timeout on a sliding 1-year window, and makes
 * it ignore shift-end expiry.
 *
 * Default: verifies the PIN, creates a session, sets the httpOnly `cf_sid`
 * cookie, audits the result.
 *
 * Pinless mode: when `AUTH_PINLESS_SIGNIN=true` AND the request resolved to a
 * real tenant (a known `x-tenant-slug`, or the operator-set
 * `DEFAULT_TENANT_SLUG` bridge), an empty/missing `pin` skips verification and
 * signs the staff in by name alone (active status still required). Audited as
 * `signin.pinless`, throttled per IP and per staffId. An apex / preview /
 * unknown-slug host resolves to the nil org and never takes this path — see
 * `isPinlessEnabled`. Flip the env var off to restore the PIN gate everywhere.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import {
  createSession,
  cookieMaxAgeForSession,
  asPersistentFlag,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  sessionHandle,
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { findActiveShift, clockIn } from '@/lib/auth/shift-clock';
import { getStaffAuthMethod } from '@/lib/auth/auth-policy';
import {
  resolveOrgIdFromRequest,
  resolveOrgIdFromHost,
  NIL_ORG_ID,
} from '@/lib/tenancy/resolve-org-from-request';
import { checkRateLimitAsync, clientIpOrNull } from '@/lib/api-guard';

export const runtime = 'nodejs';

/**
 * Hosts on which the pinless path may trust the proxy-stamped `x-tenant-slug`
 * instead of deriving the tenant from the host itself.
 *
 * Exists for exactly one reason: the dogfood dev surfaces (`localhost`, the
 * named Cloudflare tunnel) are hosts whose *slug is deliberately reserved*
 * (`RESERVED_SUBDOMAINS` in `@/lib/tenancy/tenant-host`), so a host-derived
 * tenant is `null` there and name-only signin would stop working for the
 * operator. An explicit allowlist keeps that flow while leaving the production
 * apex and every preview host closed by default. NEVER add a public hostname.
 */
function isPinlessTrustedHost(host: string | null): boolean {
  if (!host) return false;
  const bare = host.split(':')[0]!.toLowerCase();
  const allow = (process.env.AUTH_PINLESS_TRUSTED_HOSTS ?? '')
    .split(',')
    .map((h) => h.split(':')[0]!.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(bare);
}

/**
 * Gate for the name-only signin path: enforces that pinless requires BOTH the
 * `AUTH_PINLESS_SIGNIN` master switch and a request that resolved to a real
 * tenant — the nil org (apex / preview / unknown slug) can never mint a
 * session from a `staffId` alone.
 */
function isPinlessEnabled(orgId: string): boolean {
  if (orgId === NIL_ORG_ID) return false;
  const v = (process.env.AUTH_PINLESS_SIGNIN ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

function asDeviceKind(raw: unknown): DeviceKind {
  if (raw === 'personal' || raw === 'station' || raw === 'phone') return raw;
  return 'station';
}

export async function POST(req: NextRequest) {
  // Trusted-hop client IP (api-guard): the leftmost x-forwarded-for hop is
  // caller-chosen, which made every IP-keyed throttle and audit row forgeable.
  const ip = clientIpOrNull(req.headers);
  const ua = req.headers.get('user-agent');
  let staffIdForAudit: number | null = null;

  try {
    // Per-IP throttle: this route verifies PINs by staffId, so it must resist
    // credential-stuffing bursts. Warns (does not hard-fail) when Upstash is
    // unset — see api-guard boot warning.
    const rl = await checkRateLimitAsync({
      headers: req.headers,
      routeKey: 'auth-signin',
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'RATE_LIMITED' },
        { status: 429, headers: rl.retryAfterSec ? { 'retry-after': String(rl.retryAfterSec) } : undefined },
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const staffId = Number((body as { staffId?: unknown }).staffId);
    const pin = String((body as { pin?: unknown }).pin ?? '');
    const deviceKind = asDeviceKind((body as { deviceKind?: unknown }).deviceKind);
    const deviceLabel = ((body as { deviceLabel?: unknown }).deviceLabel ?? null) as string | null;
    const persistent = asPersistentFlag((body as { persistent?: unknown }).persistent);

    if (!Number.isFinite(staffId) || staffId <= 0) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'staffId' }, { status: 400 });
    }
    staffIdForAudit = staffId;

    // Tenant scope: resolve the org from the request BEFORE verifying anything.
    // Apex / unknown slug → nil org → 404, so an unscoped PIN can never sign in
    // globally (the leak). PIN + pinless paths below are both org-scoped.
    const orgId = await resolveOrgIdFromRequest(req);
    if (orgId === NIL_ORG_ID) {
      await audit({
        staffId, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'tenant_required' },
      });
      return NextResponse.json({ error: 'TENANT_REQUIRED' }, { status: 404 });
    }

    // WS6.1: staff forced onto password auth must use the account
    // (email + password) entry point — refuse the station PIN/pinless path.
    // Defaults to 'pin' (incl. when the column is absent pre-migration), so
    // every existing staff signs in exactly as before.
    if ((await getStaffAuthMethod(staffId)) === 'password') {
      await audit({
        staffId, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'auth_method_password' },
      });
      return NextResponse.json(
        { error: 'AUTH_METHOD_PASSWORD_REQUIRED', hint: 'Sign in with your email and password.' },
        { status: 403 },
      );
    }

    // Tenant-bound twice over. `orgId` above comes from `x-tenant-slug`, which
    // `proxy()` authors and strips on the way in — correct for the PIN path.
    // The pinless path additionally requires the HOST itself to name the same
    // tenant, so a handler reached without the proxy in front (matcher gap,
    // direct invocation, internal fetch) cannot be handed a tenant by header
    // and mint a name-only session. Same fail-closed answer on apex/preview.
    // `AUTH_PINLESS_TRUSTED_HOSTS` is the documented dev escape hatch (see
    // isPinlessTrustedHost); on any other host the tenant must come from the
    // host itself, not from a header a caller could supply.
    const hostTrusted = isPinlessTrustedHost(
      req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host,
    );
    const hostOrgId = hostTrusted ? orgId : await resolveOrgIdFromHost(req);
    const pinless = !pin && hostOrgId === orgId && isPinlessEnabled(hostOrgId);

    if (!pin && !pinless) {
      return NextResponse.json({ error: 'INVALID_REQUEST', field: 'pin' }, { status: 400 });
    }

    let row: { name: string; role: string; status: string; default_home_path: string | null; default_home_path_mobile: string | null };
    if (pinless) {
      // Per-staff throttle. One request is enough to hold a session for a
      // known staffId (accepted risk, handoff §10), but this bounds walking
      // the whole roster returned by the public staff picker.
      const staffRl = await checkRateLimitAsync({
        headers: req.headers,
        routeKey: 'auth-signin-pinless',
        scope: String(staffId),
        limit: 10,
        windowMs: 600_000,
      });
      if (!staffRl.ok) {
        return NextResponse.json(
          { error: 'RATE_LIMITED', retryAfterSec: staffRl.retryAfterSec },
          { status: 429, headers: staffRl.retryAfterSec ? { 'retry-after': String(staffRl.retryAfterSec) } : undefined },
        );
      }
      const lookup = await pool.query<{ name: string; role: string; status: string; default_home_path: string | null; default_home_path_mobile: string | null }>(
        `SELECT name, role, COALESCE(status, 'active') AS status, default_home_path, default_home_path_mobile
           FROM staff
          WHERE id = $1
            AND organization_id = $2
            AND COALESCE(active, true) = true
          LIMIT 1`,
        [staffId, orgId],
      );
      const found = lookup.rows[0];
      if (!found) {
        await audit({
          staffId, event: 'signin.pinless', result: 'denied', ip, userAgent: ua,
          detail: { reason: 'not_found' },
        });
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      row = found;
    } else {
      row = await verifyStaffPin(staffId, pin, orgId);
    }
    if (row.status !== 'active') {
      await audit({
        staffId, event: pinless ? 'signin.pinless' : 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'status', status: row.status },
      });
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE', status: row.status }, { status: 403 });
    }

    // Sign-in == clock-in (soft gate). Look up an active shift but do NOT
    // reject when there isn't one — staff should always be able to clock in
    // (covering a shift unannounced, working off-hours, etc.). When a shift
    // exists the session expires at shift end; otherwise the device-kind
    // absolute window applies as before.
    const activeShift = await findActiveShift(staffId);

    const session = await createSession({
      staffId,
      deviceKind,
      deviceLabel,
      ip,
      userAgent: ua,
      persistent,
      // Only bind expiry to shift end when a shift is actually present.
      // createSession ignores this for a persistent session — "keep me signed
      // in" must outlive the shift, or the checkbox is a lie again.
      ...(activeShift ? { expiresAt: activeShift.ends_at } : {}),
    });

    // Open the clock-in punch either tied to the shift or off-the-books.
    // clockIn is idempotent (DB unique index + re-fetch on conflict).
    const punch = await clockIn(staffId, activeShift?.id ?? null, 'pin');

    await audit({
      staffId, sid: session.sid, event: pinless ? 'signin.pinless' : 'signin.pin', result: 'ok',
      ip, userAgent: ua,
      detail: {
        deviceKind, deviceLabel, pinless, persistent,
        shiftId: activeShift?.id ?? null,
        punchId: punch?.id ?? null,
        unscheduled: !activeShift,
      },
    });

    const res = NextResponse.json({
      ok: true,
      staffId,
      role: row.role,
      name: row.name,
      defaultHomePath: row.default_home_path,
      defaultHomePathMobile: row.default_home_path_mobile,
      session: {
        // Never hand the raw bearer sid to a client (handoff §3.2 item 13);
        // the cookie carries the credential, the body carries a handle.
        sid: sessionHandle(session.sid),
        deviceKind: session.deviceKind,
        expiresAt: session.expiresAt,
      },
      shift: activeShift
        ? { id: activeShift.id, startsAt: activeShift.starts_at, endsAt: activeShift.ends_at }
        : null,
      punchId: punch?.id ?? null,
    });
    res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAgeForSession(session),
    });
    res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof PinError) {
      await audit({
        staffId: staffIdForAudit, event: 'signin.pin', result: 'denied', ip, userAgent: ua,
        detail: { code: err.code },
      });
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'NO_PIN' ? 409
        : err.code === 'LOCKED' ? 423
        : 401;
      return NextResponse.json({ error: err.code }, { status });
    }
    console.error('[/api/auth/signin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
