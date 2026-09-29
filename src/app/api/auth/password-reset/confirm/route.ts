/** POST /api/auth/password-reset/confirm (PUBLIC) */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { claimPasswordResetToken } from '@/lib/auth/password-reset';
import { setAccountPassword } from '@/lib/identity/accounts';
import { listMembershipsForAccount, logAuthEvent } from '@/lib/identity/memberships';
import { recordStaffLoginRedirect } from '@/lib/auth/record-staff-login';
import { tenantQuery } from '@/lib/tenancy/db';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

const Body = z.object({
  token: z.string().trim().min(1).max(512),
  password: z.string().min(8).max(200),
  organizationId: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  const limited = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-password-reset-confirm',
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: limited.retryAfterSec },
      { status: 429 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const claim = await claimPasswordResetToken(parsed.token);
  if (!claim) {
    return NextResponse.json({ error: 'INVALID_OR_EXPIRED_TOKEN' }, { status: 400 });
  }

  await setAccountPassword(claim.accountId, parsed.password);
  await logAuthEvent({ accountId: claim.accountId, orgId: null, event: 'password_reset', ip, userAgent: ua });

  const memberships = await listMembershipsForAccount(claim.accountId);
  if (memberships.length === 0) {
    return NextResponse.json({ ok: true });
  }

  let target = memberships[0]!;
  if (parsed.organizationId) {
    const match = memberships.find((m) => m.organization_id === parsed.organizationId);
    if (!match) {
      // Password IS set; just can't auto-enter that org. Let them pick on /signin.
      return NextResponse.json({ ok: true, needsOrgChoice: memberships.length > 1 });
    }
    target = match;
  } else if (memberships.length > 1) {
    return NextResponse.json({
      ok: true,
      needsOrgChoice: true,
      memberships: memberships.map((m) => ({
        organizationId: m.organization_id,
        organizationName: m.organization_name,
      })),
    });
  }

  // "Keep me signed in":
  const session = await createSession({
    staffId: target.staff_id,
    deviceKind: 'personal',
    ip,
    userAgent: ua,
  });

  // `accounts` is the cross-org identity row; the staff row is stamped under its own org's GUC.
  void pool.query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [claim.accountId]).catch(() => {});
  const redirectTo = await recordStaffLoginRedirect(
    { query: (text, params) => tenantQuery(target.organization_id, text, params ?? []) },
    target.staff_id,
    { mobile: false },
  );

  await audit({
    staffId: target.staff_id, sid: session.sid,
    event: 'signin.account', result: 'ok', ip, userAgent: ua,
    detail: { accountId: claim.accountId, orgId: target.organization_id, via: 'password_reset' },
  });
  await logAuthEvent({ accountId: claim.accountId, orgId: target.organization_id, event: 'login', ip, userAgent: ua });

  const res = NextResponse.json({ ok: true, organizationId: target.organization_id, redirectTo });
  res.cookies.set(SESSION_COOKIE_NAME, session.sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: cookieMaxAgeForSession(session),
  });
  return res;
}
