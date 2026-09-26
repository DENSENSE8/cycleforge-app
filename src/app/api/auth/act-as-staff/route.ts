/** POST /api/auth/act-as-staff (session-gated; DOGFOOD / QA only) */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createSession,
  cookieMaxAgeForSession,
  loadSession,
  revokeSession,
  readSessionSid,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  type DeviceKind,
} from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { parseOrgSettings, isSharedStaffAccountOrg } from '@/lib/tenancy/settings';
import { evaluateActAs, actAsErrorStatus } from '@/lib/auth/act-as-staff';
import { checkRateLimitAsync } from '@/lib/api-guard';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

const Body = z.object({
  staffId: z.number().int().positive(),
  deviceKind: z.enum(['personal', 'station']).optional(),
  persistent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-act-as-staff',
    limit: 40,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec }, { status: 429 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  // Must already be signed in (the owner password is the entry gate).
  const prevSid = readSessionSid(req.cookies);
  const prev = prevSid ? await loadSession(prevSid) : null;
  if (!prev) {
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 });
  }
  const callerOrgId = prev.organizationId;

  // Is the caller's org a shared-account (umbrella) workspace?
  let sharedAccountEnabled = false;
  try {
    const orgRes = await pool.query<{ settings: unknown }>(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [callerOrgId],
    );
    sharedAccountEnabled = isSharedStaffAccountOrg(parseOrgSettings(orgRes.rows[0]?.settings));
  } catch {
    sharedAccountEnabled = false;
  }

  // Load the target staff (NOT org-filtered, so a cross-org id reads as CROSS_ORG).
  const targetRes = await pool.query<{
    organization_id: string;
    active: boolean;
    role: string | null;
    default_home_path: string | null;
    default_home_path_mobile: string | null;
  }>(
    `SELECT organization_id,
            COALESCE(active, true)     AS active,
            role,
            default_home_path,
            default_home_path_mobile
       FROM staff WHERE id = $1 LIMIT 1`,
    [parsed.staffId],
  );
  const target = targetRes.rows[0] ?? null;

  const decision = evaluateActAs({
    sharedAccountEnabled,
    callerOrgId,
    target: target ? { orgId: target.organization_id, active: target.active } : null,
  });
  if (!decision.ok) {
    await audit({
      staffId: parsed.staffId, event: 'signin.act_as', result: 'denied', ip, userAgent: ua,
      detail: { reason: decision.error, previousStaffId: prev.staffId, orgId: callerOrgId },
    });
    return NextResponse.json({ error: decision.error }, { status: actAsErrorStatus(decision.error) });
  }

  const deviceKind: DeviceKind = parsed.deviceKind ?? 'personal';
  const persistent = parsed.persistent ?? prev.persistent;
  const session = await createSession({ staffId: parsed.staffId, deviceKind, ip, userAgent: ua, persistent });

  // Revoke the previous (owner / prior act-as) session AFTER the new one exists.
  if (prev.staffId !== parsed.staffId) {
    await revokeSession(prev.sid);
  }

  await audit({
    staffId: parsed.staffId, sid: session.sid, event: 'signin.act_as', result: 'ok', ip, userAgent: ua,
    detail: { previousStaffId: prev.staffId, previousSid: prev.sid, orgId: callerOrgId, deviceKind, persistent },
  });

  const res = NextResponse.json({
    ok: true,
    staffId: parsed.staffId,
    role: target!.role,
    defaultHomePath: target!.default_home_path,
    defaultHomePathMobile: target!.default_home_path_mobile,
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
}
