/** Liveness endpoint — always 200 when the process can serve a request. */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): NextResponse {
  const version =
    process.env.APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'unknown';
  return NextResponse.json(
    {
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
