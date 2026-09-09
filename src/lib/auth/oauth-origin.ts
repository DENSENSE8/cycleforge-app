import type { NextRequest } from 'next/server';

/**
 * The origin an OAuth round trip must be pinned to: the one the BROWSER is
 * actually on.
 *
 * ## Why this is not `NEXT_PUBLIC_APP_URL`
 *
 * Both OAuth routes used to read `NEXT_PUBLIC_APP_URL || APP_URL` first and the
 * request host only as a fallback. That variable exists so a background job or
 * an email can write an absolute link with no request in hand — it is a
 * DEPLOYMENT's canonical address, and it is pinned in `.env` to one host
 * (`usav-dev.michaelgarisek.com`). For a redirect URI that is the wrong answer
 * on every other origin the app answers on, and it fails in a way that looks
 * like an auth bug rather than a config one:
 *
 *   - a sign-in begun on `http://localhost:3074` sends Google a redirect URI on
 *     `usav-dev`, so the callback lands on a DIFFERENT server — and the
 *     `cf_oauth` state cookie, which is host-scoped, is not there. The operator
 *     gets `/signin?login_error=oauth_state` with nothing to act on;
 *   - the same is true of every lane hostname, so each new lane had to override
 *     the variable to sign in at all.
 *
 * ## Both routes MUST agree, exactly
 *
 * Google, Apple and Microsoft all compare the `redirect_uri` on the token
 * exchange byte-for-byte against the one from the authorize request. `start` and
 * `callback` therefore cannot each derive it their own way — hence one exported
 * helper rather than a copy in each file. The callback is reached ON the
 * redirect URI's own host, so a request-derived origin is the same string both
 * times by construction.
 *
 * `x-forwarded-*` is honoured because a Cloudflare tunnel (every lane, and the
 * dev tunnel) terminates TLS and proxies to `127.0.0.1:<port>`: without it the
 * app would derive `http://127.0.0.1:3074` for a browser that is on
 * `https://<lane>.michaelgarisek.com`. Trusting those headers is safe here for
 * the same reason it is everywhere else in this app — nothing but our own proxy
 * can reach the origin server.
 *
 * The env vars stay as the last resort, for a request with no host at all.
 */
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
