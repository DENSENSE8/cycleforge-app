/** POST /api/auth/account/signin (PUBLIC) */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createSession,
  cookieMaxAgeForSession,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { getAccountByEmail } from '@/lib/identity/accounts';
import { verifyPassword } from '@/lib/identity/password';
import { listMembershipsForAccount, logAuthEvent } from '@/lib/identity/memberships';
import { resolveAccountSigninTarget } from '@/lib/identity/signin-target';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { loadSharedStaffChoices } from '@/lib/identity/shared-staff-choice';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

const Body = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  organizationId: z.string().trim().min(1).optional(),
  persistent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  // Per-IP throttle against credential stuffing.
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-account-signin',
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  // Per-email throttle so one targeted account can't be brute-forced across IPs.
  const emailRl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-account-signin-email',
    scope: parsed.email.toLowerCase(),
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!emailRl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: emailRl.retryAfterSec },
      { status: 429 },
    );
  }

  const account = await getAccountByEmail(parsed.email);
  // Generic 401 — never reveal whether the email exists.
  const ok = account ? await verifyPassword(parsed.password, account.passwordHash) : false;
  if (!account || !ok) {
    await logAuthEvent({ accountId: account?.id ?? null, orgId: null, event: 'failed_login', ip, userAgent: ua });
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  if (account.status !== 'active') {
    return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 });
  }

  const memberships = await listMembershipsForAccount(account.id);
  if (memberships.length === 0) {
    return NextResponse.json({ error: 'NO_WORKSPACE' }, { status: 403 });
  }

  // Resolve which workspace to enter (policy in signin-target.ts — the
  // organizationId is honored only against the memberships just fetched).
  const decision = resolveAccountSigninTarget(memberships, parsed.organizationId);
  if (decision.kind === 'no_workspace') {
    return NextResponse.json({ error: 'NO_WORKSPACE' }, { status: 403 });
  }
  if (decision.kind === 'not_member') {
    return NextResponse.json({ error: 'NOT_A_MEMBER' }, { status: 403 });
  }
  if (decision.kind === 'needs_choice') {
    // Let the client present a workspace picker, then POST again with org id.
    return NextResponse.json({
      needsOrgChoice: true,
      memberships: decision.memberships.map((m) => ({
        organizationId: m.organization_id,
        organizationName: m.organization_name,
      })),
    });
  }
  const target = decision.target;

  const session = await createSession({
    staffId: target.staff_id,
    deviceKind: 'personal',
    ip,
    userAgent: ua,
    persistent: parsed.persistent === true,
  });

  // Best-effort last-login stamp.
  void pool
    .query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [account.id])
    .catch(() => {});

  await audit({
    staffId: target.staff_id, sid: session.sid,
    event: 'signin.account', result: 'ok', ip, userAgent: ua,
    detail: { accountId: account.id, orgId: target.organization_id, persistent: parsed.persistent === true },
  });
  await logAuthEvent({ accountId: account.id, orgId: target.organization_id, event: 'login', ip, userAgent: ua });

  // SHARED-account (umbrella) avenue:
  const staffChoice = await loadSharedStaffChoices(target.organization_id, target.staff_id);

  const res = NextResponse.json({
    ok: true,
    organizationId: target.organization_id,
    ...(staffChoice
      ? { needsStaffChoice: true, organizationName: target.organization_name, staff: staffChoice.staff }
      : {}),
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
  // Remember the last workspace slug (non-httpOnly, long-lived) so the apex
  // /signin can offer a "Continue to {slug}" deep link. Never sensitive.
  const slugRes = await pool
    .query<{ slug: string }>(`SELECT slug FROM organizations WHERE id = $1 LIMIT 1`, [target.organization_id])
    .catch(() => null);
  const slug = slugRes?.rows[0]?.slug;
  if (slug) {
    res.cookies.set('cf_last_workspace', slug, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180, // 180 days
    });
  }
  return res;
}
