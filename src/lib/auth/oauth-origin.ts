import type { NextRequest } from 'next/server';

/** The origin an OAuth round trip must be pinned to: */
export function oauthOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.nextUrl.host;
  if (host) {
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const proto = forwardedProto || req.nextUrl.protocol.replace(/:$/, '') || 'https';
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || req.nextUrl.origin;
}
