/** Cron auth + base-URL helpers. */

import { NextResponse } from 'next/server';

import { resolvePublicAppUrl } from '@/lib/env-utils';
import { safeStrEqual } from '@/lib/security/safe-compare';

/**
 * Resolve the app's public base URL (no trailing slash). Used by jobs that
 * need to build absolute URLs (callbacks, self-referential fetches).
 */
export function getAppBaseUrl(): string {
  const normalized = resolvePublicAppUrl();
  if (!normalized) {
    throw new Error('APP_URL, NEXT_PUBLIC_APP_URL, or VERCEL_URL is required');
  }
  return normalized;
}

/** Vercel cron requests carry `Authorization: */
export function isAuthorizedCronRequest(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authorization = headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const suppliedSecret = authorization.slice('Bearer '.length);
  return safeStrEqual(suppliedSecret, secret);
}

export function unauthorizedCronResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
