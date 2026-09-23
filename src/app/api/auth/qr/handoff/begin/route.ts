/**
 * POST /api/auth/qr/handoff/begin
 *
 * GateGuard: desk UI PhoneHandoffQrDialog. Schema qr_login_sessions.flow=desk_to_phone.
 * User: implement B desk→phone handoff. Auth required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createDeskToPhoneHandoff } from '@/lib/auth/qr-login';
import { oauthOrigin } from '@/lib/auth/oauth-origin';
import { audit } from '@/lib/auth/audit';

export const runtime = 'nodejs';


export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-handoff-begin',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');
  const body = await req.json().catch(() => ({}));
  const persistent = body.persistent !== false;

  try {
    const handoff = await createDeskToPhoneHandoff({
      staffId: me.staffId,
      organizationId: me.organizationId,
      ip,
      userAgent: ua,
      persistent,
    });

    // The QR must point at the host the DESK is on. `NEXT_PUBLIC_APP_URL` is a
    // deployment's canonical address (pinned to one host), so using it here
    // sent every lane / localhost desk's phone to a different server: the
    // phone's session cookie landed on that host and the desk never paired.
    const claimUrl = `${oauthOrigin(req).replace(/\/$/, '')}/m/claim?token=${encodeURIComponent(handoff.token)}`;

    await audit({
      staffId: me.staffId,
      sid: me.session.sid,
      event: 'signin.qr_handoff_begin',
      result: 'ok',
      ip,
      userAgent: ua,
      detail: { shortCode: handoff.shortCode },
    });

    return NextResponse.json({
      token: handoff.token,
      shortCode: handoff.shortCode,
      displayCode: handoff.displayCode,
      expiresAt: handoff.expiresAt.toISOString(),
      url: claimUrl,
    });
  } catch (err) {
    console.error('[/api/auth/qr/handoff/begin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
