/**
 * The redirect-URI origin law: the browser's origin wins, env is the last
 * resort. A drift back to env-first is the defect this file exists to catch —
 * it does not look like an auth bug when it happens, it looks like a lost state
 * cookie.
 *
 *   npx tsx --test src/lib/auth/oauth-origin.test.ts
 */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import type { NextRequest } from 'next/server';
import { oauthOrigin } from './oauth-origin';

/** The two fields `oauthOrigin` reads, and nothing else. */
function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers), nextUrl: new URL(url) } as unknown as NextRequest;
}

test('the request host wins over the pinned deployment URL', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://usav-dev.michaelgarisek.com';
  strictEqual(
    oauthOrigin(req('http://localhost:3074/api/auth/oauth/google/start')),
    'http://localhost:3074',
  );
  delete process.env.NEXT_PUBLIC_APP_URL;
});

test('a proxied request resolves to the PUBLIC origin, not the loopback one', () => {
  // A Cloudflare tunnel terminates TLS and proxies to 127.0.0.1:<port>. Without
  // the forwarded headers every lane would hand the provider a redirect URI on
  // 127.0.0.1, which no browser can come back to.
  strictEqual(
    oauthOrigin(
      req('http://127.0.0.1:3074/api/auth/oauth/google/start', {
        'x-forwarded-host': 'mobile-arrival.michaelgarisek.com',
        'x-forwarded-proto': 'https',
      }),
    ),
    'https://mobile-arrival.michaelgarisek.com',
  );
});

test('a comma-joined forwarded chain uses the first hop the client asked for', () => {
  strictEqual(
    oauthOrigin(
      req('http://127.0.0.1:3074/x', {
        'x-forwarded-host': 'lane.michaelgarisek.com, internal.proxy',
        'x-forwarded-proto': 'https, http',
      }),
    ),
    'https://lane.michaelgarisek.com',
  );
});

test('env is the last resort, for a request carrying no host at all', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  const hostless = { headers: new Headers(), nextUrl: { host: '', protocol: '', origin: '' } } as unknown as NextRequest;
  strictEqual(oauthOrigin(hostless), 'https://app.example.com');
  delete process.env.NEXT_PUBLIC_APP_URL;
});
