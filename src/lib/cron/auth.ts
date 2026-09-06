/**
 * Cron auth + base-URL helpers.
 *
 * Lifted out of the old src/lib/qstash.ts when QStash was removed. Every cron
 * route guards with {@link isAuthorizedCronRequest}; Vercel injects
 * `Authorization: Bearer ${CRON_SECRET}` on each scheduled invocation.
 */

import { safeStrEqual } from '@/lib/security/safe-compare';
import { resolvePublicAppUrl } from '@/lib/env-utils';

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

/**
 * True only for a request carrying `Authorization: Bearer ${CRON_SECRET}`.
 *
 * The `x-vercel-cron: 1` header is deliberately NOT accepted: Vercel documents
 * it as caller-spoofable, so honouring it would authenticate any internet
 * client as Vercel Cron on all 42 cron routes. CRON_SECRET is the only control.
 *
 * Fails closed when CRON_SECRET is unset — set it in the Vercel project env and
 * redeploy (env changes only apply on redeploy).
 */
export function isVercelCronOrigin(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = headers.get('authorization');
  if (!authorization) return false;
  // Constant-time: a `===` here leaks the matching prefix of CRON_SECRET.
  return safeStrEqual(authorization, `Bearer ${secret}`);
}

/**
 * True if a request is an authorized cron trigger. Kept as a distinct name from
 * {@link isVercelCronOrigin} so call sites read intent-first and so a future
 * additional trigger source has one place to land.
 */
export function isAuthorizedCronRequest(headers: Headers): boolean {
  return isVercelCronOrigin(headers);
}
