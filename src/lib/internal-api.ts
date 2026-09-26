import { NextRequest, NextResponse } from 'next/server';
import { safeStrEqual } from '@/lib/security/safe-compare';

export function requireInternalToken(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN;

  // Fail CLOSED when no token is configured.
  if (!expected) {
    const isProd =
      process.env.VERCEL_ENV === 'production' ||
      process.env.NODE_ENV === 'production';
    if (isProd) {
      return NextResponse.json(
        { error: 'Service unavailable: INTERNAL_API_TOKEN not configured' },
        { status: 503 },
      );
    }
    return null;
  }

  const rawAuth = req.headers.get('authorization') || '';
  const bearer = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : '';
  const headerToken = req.headers.get('x-internal-token') || '';

  if (
    (bearer && safeStrEqual(bearer, expected)) ||
    (headerToken && safeStrEqual(headerToken, expected))
  ) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
