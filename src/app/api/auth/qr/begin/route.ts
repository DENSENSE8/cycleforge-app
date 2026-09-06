import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { createQrLoginSession } from '@/lib/auth/qr-login';

export const runtime = 'nodejs';

function origin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

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

    return NextResponse.json({
      token,
      expiresAt: expiresAt.toISOString(),
      url: authUrl,
    });
  } catch (err) {
    console.error('[/api/auth/qr/begin] error:', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
