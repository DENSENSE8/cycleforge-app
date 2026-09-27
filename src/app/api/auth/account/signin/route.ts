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
import { authenticateAccountPassword, recordAccountSignin } from '@/lib/identity/account-signin';
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

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await authenticateAccountPassword({
    headers: req.headers,
    email: parsed.email,
    password: parsed.password,
    organizationId: parsed.organizationId,
    ip,
    userAgent: ua,
  });
  switch (result.kind) {
    case 'rate_limited':
      return NextResponse.json({ error: 'RATE_LIMITED', retryAfterSec: result.retryAfterSec }, { status: 429 });
    case 'invalid_credentials':
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    case 'account_not_active':
      return NextResponse.json({ error: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 });
    case 'no_workspace':
      return NextResponse.json({ error: 'NO_WORKSPACE' }, { status: 403 });
    case 'not_member':
      return NextResponse.json({ error: 'NOT_A_MEMBER' }, { status: 403 });
    case 'needs_org_choice':
      // Let the client present a workspace picker, then POST again with org id.
      return NextResponse.json({ needsOrgChoice: true, memberships: result.memberships });
    case 'ok':
      break;
  }
  const target = result.target;

  const session = await createSession({
    staffId: target.staff_id,
    deviceKind: 'personal',
    ip,
    userAgent: ua,
    persistent: parsed.persistent === true,
  });
  const { firstSigninToday } = await recordAccountSignin({
    accountId: result.accountId,
    target,
    session,
    event: 'signin.account',
    ip,
    userAgent: ua,
  });

  // SHARED-account (umbrella) avenue:
  const staffChoice = await loadSharedStaffChoices(target.organization_id, target.staff_id);

  const res = NextResponse.json({
    ok: true,
    organizationId: target.organization_id,
    firstSigninToday,
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
