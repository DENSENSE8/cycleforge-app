/**
 * Deploy SHA probe for the staff product-updates host.
 *
 * Public (allowlisted in proxy.ts) — returns only `{ sha }`, the same class
 * of info `/api/health` already exposes. The client captures the sha on
 * document load and polls; a mismatch shows a quiet "New version — refresh"
 * chip. Never force-reloads.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): NextResponse {
  const sha =
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev';
  return NextResponse.json(
    { sha },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
