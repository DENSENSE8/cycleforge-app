import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { createQrLoginSession } from '@/lib/auth/qr-login';
import { hashQrToken, qrAuthCapability, qrAuthChannelName } from '@/lib/realtime/qr-auth-channel';

export const runtime = 'nodejs';

/** Mint the phone auth URL on this request host (tenant or apex). */
function origin(req: NextRequest): string {
  return req.nextUrl.origin;
}

let ablyRestClient: Ably.Rest | null = null;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-qr-begin',
    limit: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = req.headers.get('user-agent');
  const body = await req.json().catch(() => ({}));
  const persistent = body.persistent === true;

  try {
    const { token, expiresAt } = await createQrLoginSession({ ip, userAgent: ua, persistent });
    const authUrl = `${origin(req).replace(/\/$/, '')}/m/qr-auth?token=${encodeURIComponent(token)}`;

    // The push grant: subscribe-only on this session's anonymous channel,
    // dead when the QR dies. No key configured => the panel keeps polling —
    // the grant is an acceleration, never a dependency.
    let ably: { token: string; channel: string } | null = null;
    const key = getValidatedAblyApiKey();
    if (key) {
      if (!ablyRestClient) ablyRestClient = new Ably.Rest({ key });
      const ttl = Math.max(60_000, expiresAt.getTime() - Date.now());
      const details = await ablyRestClient.auth.requestToken({
        capability: JSON.stringify(qrAuthCapability(hashQrToken(token))),
        ttl,
      });
      ably = { token: details.token, channel: qrAuthChannelName(hashQrToken(token)) };
    }

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      url: authUrl,
      ably,
    });
  } catch (err) {
    console.error('[/api/auth/qr/begin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
