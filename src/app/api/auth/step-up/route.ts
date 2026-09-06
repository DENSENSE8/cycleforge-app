/**
 * POST /api/auth/step-up
 *
 * Body: { scope: string, method: 'pin' | 'passkey', pin?: string,
 *         response?: AuthenticationResponseJSON }
 *
 * Grants a step-up trust window for the current session and named scope.
 * Required before destructive actions (bin.remove, shipping.void_order,
 * admin.manage_staff, etc).
 *
 * The `pin` method is a PIN oracle bounded by a per-IP and per-staff throttle,
 * and is refused for a staffer forced onto password auth (they step up with a
 * passkey instead) — mirrors /api/auth/signin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import {
  bumpPasskeyCounter,
  PASSKEY_CHALLENGE_COOKIE,
  verifyAuthentication,
} from '@/lib/auth/webauthn';
import { grantStepUp } from '@/lib/auth/stepup';
import { audit } from '@/lib/auth/audit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { getStaffAuthMethod } from '@/lib/auth/auth-policy';
import { checkRateLimitAsync, clientIpOrNull } from '@/lib/api-guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Trusted-hop client IP (api-guard): the leftmost x-forwarded-for hop is
  // caller-chosen, which made every IP-keyed throttle and audit row forgeable.
  const ip = clientIpOrNull(req.headers);
  const ua = req.headers.get('user-agent');

  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const scope = String((body as { scope?: unknown }).scope ?? '').trim();
    const method = String((body as { method?: unknown }).method ?? '').trim();
    if (!scope) return NextResponse.json({ error: 'INVALID_REQUEST', field: 'scope' }, { status: 400 });

    if (method === 'pin') {
      // Per-IP and per-staff throttle: this is the second PIN verification
      // surface, reachable with any valid session.
      const ipRl = await checkRateLimitAsync({
        headers: req.headers,
        routeKey: 'auth-stepup-pin',
        limit: 20,
        windowMs: 10 * 60 * 1000,
      });
      if (!ipRl.ok) {
        return NextResponse.json(
          { error: 'RATE_LIMITED', retryAfterSec: ipRl.retryAfterSec },
          { status: 429 },
        );
      }
      const staffRl = await checkRateLimitAsync({
        headers: req.headers,
        routeKey: 'auth-stepup-pin-staff',
        scope: String(me.staffId),
        limit: 10,
        windowMs: 10 * 60 * 1000,
      });
      if (!staffRl.ok) {
        return NextResponse.json(
          { error: 'RATE_LIMITED', retryAfterSec: staffRl.retryAfterSec },
          { status: 429 },
        );
      }

      // A staffer forced onto password auth has no live PIN credential — a
      // stale hash must not satisfy step-up for them.
      if ((await getStaffAuthMethod(me.staffId)) === 'password') {
        await audit({
          staffId: me.staffId, sid: me.session.sid,
          event: 'stepup', result: 'denied', ip, userAgent: ua,
          detail: { scope, method, reason: 'auth_method_password' },
        });
        return NextResponse.json(
          { error: 'AUTH_METHOD_PASSWORD_REQUIRED', hint: 'Confirm with your passkey.' },
          { status: 403 },
        );
      }

      const pin = String((body as { pin?: unknown }).pin ?? '');
      try {
        await verifyStaffPin(me.staffId, pin);
      } catch (err) {
        await audit({
          staffId: me.staffId, sid: me.session.sid,
          event: 'stepup', result: 'denied', ip, userAgent: ua,
          detail: { scope, method, reason: err instanceof PinError ? err.code : 'error' },
        });
        if (err instanceof PinError) {
          return NextResponse.json(
            { error: err.code },
            { status: err.code === 'LOCKED' ? 423 : 401 },
          );
        }
        throw err;
      }
      await grantStepUp(me.session.sid, scope, 'pin');
      await audit({
        staffId: me.staffId, sid: me.session.sid,
        event: 'stepup', result: 'ok', ip, userAgent: ua,
        detail: { scope, method: 'pin' },
      });
      return NextResponse.json({ ok: true });
    }

    if (method === 'passkey') {
      const response = (body as { response?: unknown }).response as AuthenticationResponseJSON | undefined;
      if (!response) {
        return NextResponse.json({ error: 'INVALID_REQUEST', field: 'response' }, { status: 400 });
      }
      const cookie = req.cookies.get(PASSKEY_CHALLENGE_COOKIE)?.value;
      if (!cookie) return NextResponse.json({ error: 'CHALLENGE_MISSING' }, { status: 400 });
      let challenge: string;
      try {
        const decoded = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as { challenge: string };
        challenge = decoded.challenge;
      } catch {
        return NextResponse.json({ error: 'CHALLENGE_INVALID' }, { status: 400 });
      }
      const result = await verifyAuthentication({ req, expectedChallenge: challenge, response });
      if (!result.verified || !result.passkey || !result.info) {
        await audit({
          staffId: me.staffId, sid: me.session.sid,
          event: 'stepup', result: 'denied', ip, userAgent: ua,
          detail: { scope, method: 'passkey', reason: 'verify_failed' },
        });
        return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 401 });
      }
      // Belt-and-braces: only grant if the passkey is for the signed-in user.
      if (result.passkey.staff_id !== me.staffId) {
        return NextResponse.json({ error: 'PASSKEY_MISMATCH' }, { status: 403 });
      }
      await bumpPasskeyCounter(result.passkey.id, result.info.newCounter);
      await grantStepUp(me.session.sid, scope, 'passkey');
      await audit({
        staffId: me.staffId, sid: me.session.sid,
        event: 'stepup', result: 'ok', ip, userAgent: ua,
        detail: { scope, method: 'passkey' },
      });
      const res = NextResponse.json({ ok: true });
      res.cookies.set(PASSKEY_CHALLENGE_COOKIE, '', {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', path: '/', maxAge: 0,
      });
      return res;
    }

    return NextResponse.json({ error: 'UNSUPPORTED_METHOD', method }, { status: 400 });
  } catch (err) {
    console.error('[/api/auth/step-up] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
