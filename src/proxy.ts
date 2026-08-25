/**
 * Global proxy (formerly `middleware.ts`). Handles two concerns:
 *
 * 1. Auth gate (shadow + enforce modes) — checks for the session cookie,
 *    attaches `x-pathname` to the request headers, and either passes
 *    through (shadow), redirects HTML to /signin, or returns 401 JSON
 *    for API routes when AUTH_V2_ENABLED is set.
 *
 * 2. (RETIRED 2026-08-22) Edge rewrites. Both the printed-label prefix
 *    rewrites (/m/b, /m/l, /m/u) and the phone-UA rewrites onto /m/* were
 *    removed with the page tree in the Warehouse-OS rebuild — every target
 *    route was deleted. See the two block comments below for what went and
 *    which printed-label handles are now unresolved.
 *
 * Edge runtime caveat: this file is bundled for the Edge runtime, where
 * `node:crypto`, `pg`, and the existing pool can't run. It does NOT touch
 * the database — it only checks for cookie presence. The actual session
 * lookup happens inside Node-runtime route handlers via `withAuth` /
 * `requirePermission`.
 */

import { NextRequest, NextResponse } from 'next/server';

// Inlined (not imported) to keep the Edge bundle free of node:crypto / pg.
// Must stay in sync with `src/lib/auth/session.ts` (SESSION_COOKIE_NAME +
// LEGACY_SESSION_COOKIE_NAME). During the cookie rename the edge accepts EITHER
// the canonical `cf_sid` or the legacy `usav_sid` — the migrate-on-touch to a
// single cf_sid happens in the /api/auth/session heartbeat (Node runtime).
const SESSION_COOKIE_NAME = 'cf_sid';
const LEGACY_SESSION_COOKIE_NAME = 'usav_sid';

const PUBLIC_PATHS: ReadonlyArray<RegExp> = [
  /^\/signin(?:$|\/)/,
  /^\/signup(?:$|\/)/,                  // public account creation
  /^\/not-authorized(?:$|\/)/,
  /^\/invite\/[A-Za-z0-9_-]+(?:$|\/)/,  // org invitation accept (unauthenticated)
  /^\/offline(?:$|\/)/,                 // PWA offline fallback (matches AuthContext)
  // Anonymous share-pack read + zip download by token — a token IS the
  // capability. The `[^/]+` requires a token segment, so the bare collection
  // route (`POST /api/photos/share-packs`, create) stays gated by withAuth.
  /^\/api\/photos\/share-packs\/[^/]+/,
  /^\/api\/auth\//,
  /^\/api\/beta\//,                     // public marketing beta waitlist + spots counter (no auth)
  /^\/api\/health(?:$|\/)/,
  /^\/api\/ready(?:$|\/)/,
  // TEMP Cursor debug session 251bbb — remove with /api/agent-debug-log
  /^\/api\/agent-debug-log(?:$|\/)/,
  /^\/api\/cron\//,                     // Vercel-cron-fired routes (auth via CRON_SECRET inside handler)
  /^\/api\/webhooks\//,                 // carrier + Stripe + integration callbacks
  /^\/api\/billing\/webhook(?:$|\/)/,   // Stripe webhook needs raw body, no cookie
  /^\/api\/forge\/ingest(?:$|\/)/,      // Cycle Forge loop ingress (auth via FORGE_INGEST_TOKEN inside handler)
  // GS1 Digital Link resolver — same printed QR serves both audiences.
  // The handler itself branches on session cookie: authed staff get
  // contextual redirects, anon callers bounce to the public storefront.
  /^\/gs1\/resolve(?:$|\/)/,
  /^\/01\/[0-9]+(?:$|\/)/,
  // Generic anon landing for a scanned code that resolved to no entity —
  // the tenant-branded interstitial, not a hardcoded storefront.
  /^\/qr(?:$|\/)/,
  /^\/414\/[0-9]+\/254\/[A-Za-z0-9]+(?:$|\/)/,
  // Platform carton Digital Link — anon → branded interstitial; staff → ops.
  // Platform carton Digital Link, PRINTED ON PHYSICAL STICKERS. The page
  // (`src/app/m/(shell)/r/[id]`) was deleted with the rest of `/m/**` in the
  // Warehouse-OS rebuild, so this currently allowlists a 404 — deliberately
  // LEFT IN PLACE. `src/lib/barcode-routing.ts` still resolves scanned label
  // payloads to `/m/r/{id}`, so the handle has to come back; keeping the anon
  // allowlist entry means it works the moment a landing exists again, instead
  // of silently bouncing customers to /signin. Do not "clean up" without
  // also changing `barcode-routing.ts`.
  /^\/m\/r\/\d+(?:$|\/)/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/manifest\.(json|webmanifest)$/,
  /^\/sw\.js$/,
  /^\/workbox-/,
  /^\/icons?\//,
  /^\/.well-known\//,
];

// Hostnames that should NOT be treated as a tenant subdomain. Anything else
// of the form `slug.<root>` is extracted as a tenant slug and stamped onto
// the request headers so downstream handlers can resolve the org without a
// per-request hit on the DB at the edge.
const RESERVED_SUBDOMAINS = new Set<string>([
  'www',
  'app',
  'api',
  'admin',
  'docs',
  'status',
  'staging',
  'preview',
  // Retired customer kiosk product (removed 2026-08-22). Stays reserved so the
  // label cannot be claimed as a tenant staff host by a later signup.
  'kiosk',
  // Named Cloudflare dev tunnel (pnpm dev:tunnel:named) — not a tenant slug.
  'usav-dev',
]);

function extractTenantSlug(host: string | null): string | null {
  if (!host) return null;
  // Strip port if present.
  const cleaned = host.split(':')[0]!.toLowerCase();
  // localhost and bare IPs never carry a subdomain.
  if (cleaned === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(cleaned)) return null;
  const parts = cleaned.split('.');
  // Need at least subdomain.root.tld to claim a tenant slug.
  if (parts.length < 3) return null;
  const candidate = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(candidate)) return null;
  // Vercel preview hostnames like usav-orders-git-foo-bar.vercel.app — the
  // subdomain there is the project, not a tenant. Cheap heuristic: any host
  // ending in .vercel.app skips slug extraction.
  if (cleaned.endsWith('.vercel.app')) return null;
  // Dev tunnel hostnames (Cloudflare quick tunnels, ngrok) carry a random
  // subdomain that is not a tenant. Without this, e.g. quiet-frog-1234 from
  // quiet-frog-1234.trycloudflare.com resolves to an unknown org and every
  // org-scoped query (staff picker, etc.) comes back empty on the phone.
  if (
    cleaned.endsWith('.trycloudflare.com') ||
    cleaned.endsWith('.ngrok-free.app') ||
    cleaned.endsWith('.ngrok.app') ||
    cleaned.endsWith('.ngrok.io')
  ) {
    return null;
  }
  return candidate;
}

// Edge rewrites are RETIRED (Warehouse-OS rebuild, 2026-08-22).
//
// Two families lived here and both pointed into the page tree that was just
// deleted:
//
//   1. Printed-label prefix rewrites — `/m/b/` → `/bin/`, `/m/l/` →
//      `/receiving/lines/`, `/m/u/` → `/serial/`. Every target is gone.
//   2. Phone-UA rewrites — `/receiving`, `/unbox`, `/triage`, `/pack`,
//      `/signin`, … → the `/m/*` mobile product, which was deleted whole.
//
// Family 2 had to go FIRST and is the reason this is not a cosmetic cleanup:
// it mapped `/signin` → `/m/signin`. With `/m/**` deleted, leaving it in place
// would have rewritten every phone-class sign-in attempt onto a 404 — locking
// warehouse staff out of the app on exactly the devices they carry, while
// desktop looked fine.
//
// See the lane report for the printed-label handles (`/m/r/{id}`, `/m/l/{id}`,
// `/m/u/{serial}`, `/m/b/{barcode}`) that `src/lib/barcode-routing.ts` STILL
// mints for physical stickers and that now have no landing.

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

/**
 * Auth enforcement is unconditional. The proxy never serves a page or API
 * route to an unauthenticated client outside the PUBLIC_PATHS allowlist
 * (/signin, /not-authorized, /m/enroll/*, /api/auth/*, static assets).
 *
 * 🚨 BREAK-GLASS ESCAPE HATCH (operator-only, not for normal rollout):
 *   AUTH_V2_ENABLED=false (or "0", "shadow", "off")
 *     → proxy stops redirecting/401-ing unauthenticated requests
 *     → `withAuth` and `requirePermission` STILL enforce per-route/per-page
 *     → so disabling this only removes the edge redirect, not the actual auth
 *
 * The downstream wrappers no longer honour this flag (Phase 1, 2026-05-17) —
 * they always enforce. The flag survives at proxy level only as a knob for
 * the rare case where the edge-runtime cookie check itself misfires and ops
 * needs to fall back to wrapper-level enforcement.
 */
function isAuthV2Enabled(): boolean {
  const v = (process.env.AUTH_V2_ENABLED ?? '').toLowerCase().trim();
  return v !== 'false' && v !== '0' && v !== 'shadow' && v !== 'off';
}

// The surface-migration redirect matrix is RETIRED with the page tree
// (Warehouse-OS rebuild, 2026-08-22). It held twelve resolvers — receiving
// surface/history, dashboard inbound/outbound, support orders, walk-in job +
// repair mode, pack, test, shipping, testing-history and the `/audit-log`
// family — and every single destination (`/incoming`, `/shipping/orders`,
// `/repair`, `/walk-in`, `/dashboard`, `/pack`, `/test`, `/operations`,
// `/pickup`) is now a deleted route. A 30x into a 404 is worse than no rule
// at all, so they are removed rather than left dangling.

/**
 * Security response headers. Attached to every response we hand back from
 * the proxy (rewrite, next, redirect, 401). Conservative defaults that
 * preserve the app's existing functionality:
 *
 *  - Camera is allowed on same-origin only (mobile receiving photo capture).
 *  - USB + Serial allowed same-origin only — browser-native silent label
 *    printing (WebUSB / Web Serial) in Settings → Hardware. Without `usb=(self)`
 *    `navigator.usb.requestDevice()` throws "disallowed by permissions policy".
 *  - Mic / geolocation / payment all disabled by default.
 *  - frame-ancestors 'self' (CSP) + X-Frame-Options DENY — defense in depth.
 *  - HSTS with 1y max-age + subdomains. Don't preload yet (irreversible).
 *  - Referrer policy trims cross-origin leak surface.
 *  - nosniff blocks MIME confusion attacks.
 */
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=(self)',
  'serial=(self)',
  'fullscreen=(self)',
  'interest-cohort=()',
].join(', ');

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', PERMISSIONS_POLICY);
  // Block embedding in iframes from foreign origins. X-Frame-Options is the
  // legacy header; CSP frame-ancestors covers modern browsers.
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  // We intentionally only set frame-ancestors here, not a full CSP — a full
  // CSP needs hashes/nonces for inline scripts the framework emits, which
  // is a separate effort. frame-ancestors is safe to set alone.
  const existingCsp = res.headers.get('Content-Security-Policy');
  res.headers.set(
    'Content-Security-Policy',
    existingCsp ? `${existingCsp}; frame-ancestors 'self'` : `frame-ancestors 'self'`,
  );
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hostHeader = req.headers.get('host');
  const hasCookie = Boolean(
    req.cookies.get(SESSION_COOKIE_NAME)?.value || req.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value,
  );

  // Pass the resolved pathname to RSC pages — used by requirePermission to
  // build a `?next=` query when it redirects to /signin.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  // …and the query beside it. A ROOT LAYOUT is handed no `searchParams`, so a
  // shell-level paint seed (`maybeSeedShell`) could otherwise only be gated on
  // the path — and on a station whose tabs live in the URL that means paying
  // for a seed the mounted tab will never read. Empty string when there is no
  // query; never used for auth or routing.
  requestHeaders.set('x-search', req.nextUrl.search);

  // Stamp the tenant slug (if any) so downstream handlers can resolve the
  // org without re-parsing the host header. The slug is just a hint —
  // the authoritative org id always comes from the session.
  const tenantSlug = extractTenantSlug(hostHeader);
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }

  const passThrough = (): NextResponse =>
    applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));

  if (isPublic(pathname)) {
    return passThrough();
  }

  // Break-glass off: never block. Default: redirect HTML routes / 401 JSON.
  if (!hasCookie && isAuthV2Enabled()) {
    const isApi = pathname.startsWith('/api/');
    if (isApi) {
      return applySecurityHeaders(NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return passThrough();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files; the regex
    // PUBLIC_PATHS above does the fine-grained allowlist.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
