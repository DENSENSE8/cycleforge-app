/**
 * Absolute same-origin fetch from an RSC / server helper, forwarding the
 * request session cookie. Used to seed Tier-1 collections without importing
 * `'use client'` relative-fetch modules into the server graph.
 *
 * Prefer a direct `server-only` DB helper when one exists (Packer golden);
 * this is the pragmatic waist for routes whose list SQL still lives in the
 * API handler.
 *
 * ## Deployment Protection
 *
 * On a Vercel deployment with Deployment Protection enabled (every preview, by
 * default), a request to our own origin is intercepted by the SSO gate exactly
 * like a stranger's — the server has no browser session. The call then returns
 * the gate's HTML, `res.json()` throws, and every seed built on this helper
 * degrades to `null` **silently**: the page still renders, the client still
 * fetches, and the only symptom is that the seeded content is missing from the
 * first HTML. That is invisible in production and fatal to measuring a preview,
 * which is the one place these seeds get audited. It is why `/m/home` measured
 * an LCP of ~9s on a preview while its rows were present locally.
 *
 * `VERCEL_AUTOMATION_BYPASS_SECRET` is injected into the deployment whenever
 * Protection Bypass for Automation is configured, so forwarding it here lets the
 * server reach itself. It is absent locally and in an unprotected project, where
 * this is a no-op.
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
