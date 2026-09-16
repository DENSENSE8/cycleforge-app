import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { createQrLoginSession } from '@/lib/auth/qr-login';
import { oauthOrigin } from '@/lib/auth/oauth-origin';
import { hashQrToken, qrAuthCapability, qrAuthChannelName } from '@/lib/realtime/qr-auth-channel';

export const runtime = 'nodejs';

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
    // The QR is scanned by a DIFFERENT device: the URL must carry the origin
    // the BROWSER is on (x-forwarded-host behind the switchboard/tunnel), not
    // req.nextUrl.origin — which collapses to localhost and strands the phone.
    const authUrl = `${oauthOrigin(req)}/m/qr-auth?token=${encodeURIComponent(token)}`;

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
