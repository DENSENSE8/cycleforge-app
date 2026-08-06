/**
 * Absolute same-origin fetch from an RSC / server helper, forwarding the
 * request session cookie. Used to seed Tier-1 collections without importing
 * `'use client'` relative-fetch modules into the server graph.
 *
 * Prefer a direct `server-only` DB helper when one exists (Packer golden);
 * this is the pragmatic waist for routes whose list SQL still lives in the
 * API handler.
 */
import 'server-only';
import { cookies, headers } from 'next/headers';
import { resolvePublicAppUrl } from '@/lib/env-utils';

function originFromHeaders(h: Headers): string | null {
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return null;
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host.split(',')[0]!.trim()}`;
}

async function resolveServerOrigin(): Promise<string> {
  const fromEnv = resolvePublicAppUrl();
  if (fromEnv) return fromEnv;
  const h = await headers();
  return originFromHeaders(h) || 'http://localhost:3050';
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

  return fetch(`${origin}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
}
