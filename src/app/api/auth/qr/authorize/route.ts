import { NextRequest, NextResponse } from 'next/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { authorizeQrLoginSession, getQrLoginSessionByToken } from '@/lib/auth/qr-login';
import { getCurrentUser } from '@/lib/auth/current-user';
import { verifyStaffPin } from '@/lib/auth/pin';
import { audit } from '@/lib/auth/audit';
import {
  bumpPasskeyCounter,
  PASSKEY_CHALLENGE_COOKIE,
  verifyAuthentication,
} from '@/lib/auth/webauthn';
import { isUnsignedQrVerifiedClaim } from '@/lib/auth/webauthn-rp';
import pool from '@/lib/db';
import { publishQrAuthorized } from '@/lib/realtime/publish';
import { hashQrToken } from '@/lib/realtime/qr-auth-channel';

export const runtime = 'nodejs';

/** Authorize a desktop QR login from the phone. */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-authorize',
    limit: 30,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'TOKEN_REQUIRED' }, { status: 400 });
  }

  // Reject the old unsigned Face ID claim — no crypto, no session bind.
  if (isUnsignedQrVerifiedClaim(body)) {
    return NextResponse.json({ error: 'PASSKEY_REQUIRED' }, { status: 400 });
  }

  try {
    const qrSession = await getQrLoginSessionByToken(token);
    if (!qrSession) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (qrSession.status !== 'pending') {
      return NextResponse.json({ error: `SESSION_${qrSession.status.toUpperCase()}` }, { status: 400 });
    }

    let targetStaffId: number | null = null;
    let targetOrgId: string | null = null;
    let targetStaffName = '';
    let authMethodUsed = 'passkey';

    const response = body.response as AuthenticationResponseJSON | undefined;
    if (response && typeof response === 'object' && typeof response.id === 'string') {
      const me = await getCurrentUser();
      if (!me?.staffId) {
        return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
      }

      const cookie = req.cookies.get(PASSKEY_CHALLENGE_COOKIE)?.value;
      if (!cookie) {
        return NextResponse.json({ error: 'CHALLENGE_MISSING' }, { status: 400 });
      }
      let challenge: string;
      try {
        const decoded = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as {
          challenge: string;
        };
        challenge = decoded.challenge;
      } catch {
        return NextResponse.json({ error: 'CHALLENGE_INVALID' }, { status: 400 });
      }

      const result = await verifyAuthentication({ req, expectedChallenge: challenge, response });
      if (!result.verified || !result.passkey || !result.info) {
        await audit({
          staffId: me.staffId,
          sid: me.session.sid,
          event: 'signin.qr_phone_auth',
          result: 'denied',
          ip,
          userAgent: ua,
          detail: { method: 'passkey', reason: 'verify_failed', qrSessionId: qrSession.id },
        });
        return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 401 });
      }
      if (result.passkey.staff_id !== me.staffId) {
        return NextResponse.json({ error: 'PASSKEY_MISMATCH' }, { status: 403 });
      }

      await bumpPasskeyCounter(result.passkey.id, result.info.newCounter);
      targetStaffId = me.staffId;
      targetOrgId = me.organizationId;
      targetStaffName = me.name;
      authMethodUsed = 'passkey';

      const authRes = await authorizeQrLoginSession(token, targetStaffId, targetOrgId);
      if (!authRes.ok) {
        return NextResponse.json({ error: authRes.error || 'AUTHORIZE_FAILED' }, { status: 400 });
      }

      await publishQrAuthorized(hashQrToken(token), targetStaffName).catch(() => {});

      await audit({
        staffId: targetStaffId,
        sid: me.session.sid,
        event: 'signin.qr_phone_auth',
        result: 'ok',
        ip,
        userAgent: ua,
        detail: {
          method: authMethodUsed,
          qrSessionId: qrSession.id,
          desktopIp: qrSession.ip,
        },
      });

      const res = NextResponse.json({
        ok: true,
        staffName: targetStaffName,
      });
      res.cookies.set(PASSKEY_CHALLENGE_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return res;
    }

    // Phone already signed in — bind that session to the pending desktop QR.
    const sessionUser = await getCurrentUser();
    if (sessionUser?.staffId) {
      targetStaffId = sessionUser.staffId;
      targetOrgId = sessionUser.organizationId;
      targetStaffName = sessionUser.name;
      authMethodUsed = 'phone_session';

      const authRes = await authorizeQrLoginSession(token, targetStaffId, targetOrgId);
      if (!authRes.ok) {
        return NextResponse.json({ error: authRes.error || 'AUTHORIZE_FAILED' }, { status: 400 });
      }

      await publishQrAuthorized(hashQrToken(token), targetStaffName).catch(() => {});

      await audit({
        staffId: targetStaffId,
        sid: sessionUser.session.sid,
        event: 'signin.qr_phone_auth',
        result: 'ok',
        ip,
        userAgent: ua,
        detail: {
          method: authMethodUsed,
          qrSessionId: qrSession.id,
          desktopIp: qrSession.ip,
        },
      });

      return NextResponse.json({
        ok: true,
        staffName: targetStaffName,
      });
    }

    // Optional station fallback: staffId + PIN (no phone session). Off the PWA path.
    if (body.staffId && body.pin) {
      const staffId = Number(body.staffId);
      const pin = String(body.pin).trim();
      const staffRow = await pool.query<{
        id: number;
        name: string;
        status: string;
        organization_id: string;
      }>(`SELECT id, name, status, organization_id FROM staff WHERE id = $1 LIMIT 1`, [staffId]);
      const staff = staffRow.rows[0];
      if (!staff || staff.status !== 'active') {
        return NextResponse.json({ error: 'STAFF_NOT_ACTIVE' }, { status: 403 });
      }

      const verified = await verifyStaffPin(staffId, pin, staff.organization_id);
      if (!verified) {
        return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
      }
      targetStaffId = staff.id;
      targetOrgId = staff.organization_id;
      targetStaffName = staff.name;
      authMethodUsed = 'staff_pin';
    }

    if (!targetStaffId) {
      return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    }

    const authRes = await authorizeQrLoginSession(token, targetStaffId, targetOrgId);
    if (!authRes.ok) {
      return NextResponse.json({ error: authRes.error || 'AUTHORIZE_FAILED' }, { status: 400 });
    }

    await publishQrAuthorized(hashQrToken(token), targetStaffName).catch(() => {});

    await audit({
      staffId: targetStaffId,
      sid: null,
      event: 'signin.qr_phone_auth',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: {
        method: authMethodUsed,
        qrSessionId: qrSession.id,
        desktopIp: qrSession.ip,
      },
    });

    return NextResponse.json({
      ok: true,
      staffName: targetStaffName,
    });
  } catch (err) {
    console.error('[/api/auth/qr/authorize] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
