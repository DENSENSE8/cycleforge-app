/** Absolute same-origin fetch from an RSC / server helper, forwarding the request session cookie. */
import 'server-only';
import { cookies, headers } from 'next/headers';
import { resolvePublicAppUrl } from '@/lib/env-utils';

function originFromHeaders(h: Headers): string | null {
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return null;
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host.split(',')[0]!.trim()}`;
}

/*
 * The request's own origin first: a self-fetch must land on the deployment that
 * is serving this request, whose cookie it forwards. APP_URL /
 * NEXT_PUBLIC_APP_URL name a canonical public host — in a dev lane that is a
 * different deployment, which 401s the lane's session cookie (phase0-findings
 * §3.4). The env value is only the fallback for a header-less context.
 */
async function resolveServerOrigin(): Promise<string> {
  const fromRequest = originFromHeaders(await headers());
  if (fromRequest) return fromRequest;
  return resolvePublicAppUrl() || 'http://localhost:3050';
}

export async function serverSelfFetch(
  pathWithQuery: string,
  init?: RequestInit,
): Promise<Response> {
  const origin = await resolveServerOrigin();
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  return fetch(`${origin}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
  });
}
