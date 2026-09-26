/** GET /api/auth/session */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  loadSessionWithReason,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  readSessionCookie,
  touchSession,
  cookieMaxAgeForSession,
} from '@/lib/auth/session';

/** Clear the legacy `usav_sid` cookie (Max-Age=0) — used once a request has
 *  migrated onto `cf_sid`. */
function clearLegacyCookie(res: NextResponse): void {
  res.cookies.set(LEGACY_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { getOrganization } from '@/lib/tenancy/organizations';
import { resolveEnvelopeMemberships } from '@/lib/identity/memberships';

export const runtime = 'nodejs';

export async function GET() {
  const store = await cookies();
  const { sid, legacy } = readSessionCookie(store);
  const { session, reason } = await loadSessionWithReason(sid);

  if (!session) {
    console.warn(
      `[auth/session] user:null reason=${reason} sid=${sid ? `${sid.slice(0, 8)}…` : 'none'}`,
    );
    const res = NextResponse.json(
      { user: null, debug: reason },
      { headers: { 'cache-control': 'no-store', 'x-auth-debug': reason } },
    );
    // Critical: if the cookie was present but the session it points to is invalid (revoked / expired / idle-killed / no-row), clear the cookie…
    if (sid && reason !== 'no-cookie') {
      res.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      clearLegacyCookie(res); // also drop any stale usav_sid
    }
    return res;
  }

  // Resolve the full user envelope from the DB (roles + overrides).
  const user = await getCurrentUserBySid(session.sid);
  if (!user || user.role === 'unknown') {
    console.warn(
      `[auth/session] user:null reason=no-staff-row staffId=${session.staffId} sid=${session.sid.slice(0, 8)}…`,
    );
    return NextResponse.json(
      { user: null, debug: 'no-staff-row' },
      { headers: { 'cache-control': 'no-store', 'x-auth-debug': 'no-staff-row' } },
    );
  }

  // Bump last_seen_at so the idle window slides forward on each request, and
  // pick up the (possibly slid) expires_at — for persistent staff touchSession
  // pushes it forward ~1 year on every heartbeat.
  const slidExpiresAt = (await touchSession(session.sid)) ?? session.expiresAt;

  // Resolve the active tenant's display identity so the client can show which workspace the user is in (a passive multi-tenant safety signal).
  const org = await getOrganization(user.organizationId).catch(() => null);

  // All workspaces this account can act in. Best-effort + always ≥1 entry
  // (falls back to the current org pre-migration). Never throws.
  const memberships = await resolveEnvelopeMemberships({
    staffId: user.staffId,
    currentOrgId: user.organizationId,
    currentOrgName: org?.name ?? 'Workspace',
    currentOrgSlug: org?.slug ?? null,
    currentOrgPlan: org?.plan ?? null,
  });

  const res = NextResponse.json(
    {
      user: {
        staffId: user.staffId,
        organizationId: user.organizationId,
        organizationName: org?.name ?? 'Workspace',
        organizationSlug: org?.slug ?? null,
        organizationPlan: org?.plan ?? null,
        memberships,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: Array.from(user.permissions),
        mobileDisplayConfig: user.mobileDisplayConfig,
        avatarPhotoId: user.avatarPhotoId,
        session: {
          sid: session.sid,
          deviceKind: session.deviceKind,
          deviceLabel: session.deviceLabel,
          expiresAt: slidExpiresAt,
          persistent: session.persistent,
        },
      },
    },
    { headers: { 'cache-control': 'no-store', 'x-auth-debug': 'ok' } },
  );

  // Re-issue the cookie so the browser's max-age tracks the live session expiry.
  res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: cookieMaxAgeForSession({ expiresAt: slidExpiresAt }),
  });
  // Migrate-on-touch: a request that authenticated via the legacy usav_sid gets
  // re-issued cf_sid above; drop the legacy cookie so it migrates exactly once.
  if (legacy) clearLegacyCookie(res);

  return res;
}
