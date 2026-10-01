/** Global proxy (formerly `middleware.ts`). */

import { NextRequest, NextResponse } from 'next/server';
import { v1Error } from '@/lib/api/v1-route';
// Dependency-free by construction (see its docblock) — safe in an edge bundle.
import {
  SHIPPING_SHIPPED_PATH,
  buildShippedDeskSearch,
  isLegacyShippedDeskUrl,
} from '@/lib/shipping/shipped-desk';
import {
  isBareKioskPlatformHost,
  isKioskHost,
  isKioskHostAllowedPath,
  kioskPathDogfoodActive,
  staffKioskRedirectOrigin,
} from '@/lib/tenancy/kiosk-host';
import {
  VDPL_COOKIE,
  VDPL_MAX_AGE_SEC,
  skewPinDecision,
} from '@/lib/vercel/skew-pin';
import { extractStaffTenantSlug } from '@/lib/tenancy/staff-host';

// Inlined (not imported) to keep the Edge bundle free of node:crypto / pg.
const SESSION_COOKIE_NAME = 'cf_sid';
const LEGACY_SESSION_COOKIE_NAME = 'usav_sid';

const PUBLIC_PATHS: ReadonlyArray<RegExp> = [
  /^\/signin(?:$|\/)/,
  /^\/signup(?:$|\/)/,                  // public account creation
  /^\/account\/signin(?:$|\/)/,         // account-level (email/passkey) sign-in
  /^\/m\/signin(?:$|\/)/,
  /^\/m\/qr-auth(?:$|\/)/,              // workstation QR auth page - anon phone with a token must land here,
                                          // not bounce to /signin (authorize route enforces session-or-PIN).
  /^\/m\/claim(?:$|\/)/,                // desk→phone handoff claim — token in query IS the capability
  /^\/not-authorized(?:$|\/)/,
  /^\/m\/enroll\//,
  /^\/kiosk(?:$|\/)/,                    // customer-facing kiosk (device-token principal; no staff session)
  // Callers: kiosk/tablet pages. API: POST /api/kiosk/dev-autopair. User: auto-connect org one, no pairing.
  /^\/api\/kiosk\/dev-autopair(?:$|\/)/,
  /^\/api\/kiosk\/pair(?:$|\/)/,         // tablet exchanges a pairing code for a device token (code IS the capability)
  /^\/api\/kiosk\/intake(?:$|\/)/,       // device-authed intake write (gated by withKioskAuth inside the handler)
  /^\/api\/kiosk\/repair(?:$|\/)/,       // device-authed headless repair intake (withKioskAuth; NOT the staff enroll/revoke/devices siblings)
  /^\/api\/kiosk\/sales(?:$|\/)/,        // device-authed retail catalog (withKioskAuth)
  /^\/api\/kiosk\/local-pickup(?:$|\/)/, // device-authed inbound pickup intake (withKioskAuth)
  /^\/api\/kiosk\/settings(?:$|\/)/,     // device-authed brand/settings (withKioskAuth)
  /^\/api\/kiosk\/staff-for-stepup(?:$|\/)/, // device-authed PIN step-up roster (withKioskAuth)
  /^\/api\/kiosk\/pickup(?:$|\/)/,       // device-authed order pickup lookup/collect (withKioskAuth)
  /^\/api\/kiosk\/visit(?:$|\/)/,        // device-authed visit receipt (withKioskAuth)
  /^\/api\/kiosk\/session(?:$|\/)/,      // device-authed counter-session mirror: read + set-customer + signature (withKioskAuth)
  /^\/api\/kiosk\/customer(?:$|\/)/,     // device-authed phone → name-on-file lookup, Contact step (withKioskAuth)
  /^\/api\/kiosk\/companion(?:$|\/)/,    // device-authed phone-companion link: open + sync (withKioskAuth)
  /^\/api\/kiosk\/carts(?:$|\/)/,        // device-authed Recent carts: list/create/save/open/done/clear (withKioskAuth)
  /^\/api\/realtime\/kiosk-token(?:$|\/)/, // device-principal Ably token (withKioskAuth) — the STAFF token route stays gated
  /^\/invite\/[A-Za-z0-9_-]+(?:$|\/)/,  // org invitation accept (unauthenticated)
  /^\/offline(?:$|\/)/,                 // PWA offline fallback (matches AuthContext)
  /^\/share\/photos\//,                 // public photo share-pack viewer (token capability) Anonymous share-pack read + zip download by token — a token IS the capability.
  /^\/api\/photos\/share-packs\/[^/]+/,
  /^\/api\/auth\//,
  /^\/api\/v1\/session$/,               // native sign-in mints the bearer; GET/DELETE still gated by withAuth
  /^\/api\/beta\//,                     // public marketing beta waitlist + spots counter (no auth)
  /^\/api\/health(?:$|\/)/,
  /^\/api\/ready(?:$|\/)/,
  // TEMP Cursor debug session 251bbb — remove with /api/agent-debug-log
  /^\/api\/agent-debug-log(?:$|\/)/,
  /^\/api\/cron\//,                     // Vercel-cron-fired routes (auth via CRON_SECRET inside handler)
  /^\/api\/webhooks\//,                 // carrier + Stripe + integration callbacks
  /^\/api\/billing\/webhook(?:$|\/)/,   // Stripe webhook needs raw body, no cookie
  /^\/api\/forge\/ingest(?:$|\/)/,      // Cycle Forge loop ingress (auth via FORGE_INGEST_TOKEN inside handler) GS1 Digital Link resolver — same printed QR serves both audiences.
  /^\/gs1\/resolve(?:$|\/)/,
  /^\/01\/[0-9]+(?:$|\/)/,
  // Generic anon landing for a scanned code that resolved to no entity —
  // the tenant-branded interstitial, not a hardcoded storefront.
  /^\/qr(?:$|\/)/,
  /^\/414\/[0-9]+\/254\/[A-Za-z0-9]+(?:$|\/)/,
  // Platform carton Digital Link — anon → branded interstitial; staff → ops.
  /^\/m\/r\/\d+(?:$|\/)/,
  // Square checkout "thank you" landing after a customer pays an order payment link (no data, no session).
  /^\/pay\/thanks(?:$|\/)/,
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/manifest\.(json|webmanifest)$/,
  /^\/sw\.js$/,
  /^\/workbox-/,
  /^\/icons?\//,
  /^\/.well-known\//,
];

function extractTenantSlug(host: string | null): string | null {
  return extractStaffTenantSlug(host, { laneHost: process.env.LANE_HOST });
}

// `/m/u/` is deliberately absent: the phone unit hub lives at
// `src/app/m/(shell)/u/[id]` (with /qc, /history below it); `/serial/[id]` is
// the desktop unit page.
const REWRITES: ReadonlyArray<{ prefix: string; target: string }> = [
  { prefix: '/m/b/', target: '/bin/' },
  { prefix: '/m/l/', target: '/receiving/lines/' },
];

// Dual-route pages that have a dedicated mobile counterpart.
const MOBILE_UA_REWRITES: ReadonlyMap<string, string> = new Map([
  // Packing has a dedicated phone history and capture-evidence face. It stays
  // a partial completion path until mobile pack confirmation is implemented.
  ['/pack', '/m/pack'],
  ['/pack/', '/m/pack'],
  ['/signin', '/m/signin'],
  ['/signin/', '/m/signin'],
]);

// Phones only — exclude iPad/Android tablets so they keep the desktop view.
const MOBILE_UA_RE = /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

/** Auth enforcement is unconditional. */
function isAuthV2Enabled(): boolean {
  const v = (process.env.AUTH_V2_ENABLED ?? '').toLowerCase().trim();
  return v !== 'false' && v !== '0' && v !== 'shadow' && v !== 'off';
}

function resolveRewrite(pathname: string): string | null {
  for (const { prefix, target } of REWRITES) {
    if (pathname.startsWith(prefix)) {
      return target + pathname.slice(prefix.length);
    }
  }
  return null;
}

function resolveMobileUaRewrite(pathname: string, ua: string | null): string | null {
  if (!ua || !MOBILE_UA_RE.test(ua)) return null;
  // Don't double-rewrite if the client already navigated to /m/*.
  if (pathname.startsWith('/m/')) return null;
  return MOBILE_UA_REWRITES.get(pathname) ?? null;
}

/** Surface-migration redirect (Studio-driven operator surfaces refactor). */
function resolveReceivingSurfaceRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/receiving') return null;
  const mode = url.searchParams.get('mode');
  const dest =
    mode === null || mode === 'receive'
      ? '/unbox'
      : mode === 'triage'
        ? '/triage'
        : mode === 'incoming'
          ? '/incoming'
          : mode === 'pickup'
            ? '/pickup'
            : mode === 'repair'
              ? '/repair'
              : mode === 'history'
                ? '/incoming'
                : null;
  if (!dest) return null;
  const next = url.clone();
  next.pathname = dest;
  next.searchParams.delete('mode'); // being on the surface route IS the mode
  if (mode === 'history') next.searchParams.set('lane', 'docked');
  return next;
}

/**
 * `/receiving/history` → Inbound desk Docked lane (`/incoming?lane=docked`).
 * Preserves history search/sort params (`sort`, `rh_*`, `page`, `dir`).
 */
function resolveReceivingHistoryRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/receiving/history' && url.pathname !== '/receiving/history/') return null;
  const next = url.clone();
  next.pathname = '/incoming';
  next.searchParams.set('lane', 'docked');
  return next;
}

/**
 * Dashboard inbound domain → Inbound desk Docked lane.
 * `/dashboard?mode=inbound|receiving` → `/incoming?lane=docked` (+ sort / rh_*).
 */
function resolveDashboardInboundRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/dashboard' && url.pathname !== '/dashboard/') return null;
  const mode = String(url.searchParams.get('mode') || '').trim().toLowerCase();
  if (mode !== 'inbound' && mode !== 'receiving') return null;
  const next = url.clone();
  next.pathname = '/incoming';
  next.searchParams.delete('mode');
  next.searchParams.set('lane', 'docked');
  return next;
}

/** Legacy shipment-history doors → the Shipped desk. */
function resolveShippedDeskRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (!isLegacyShippedDeskUrl(url.pathname, url.searchParams)) return null;
  const next = url.clone();
  next.pathname = SHIPPING_SHIPPED_PATH;
  next.search = buildShippedDeskSearch(url.searchParams).toString();
  return next;
}

/**
 * Dashboard bare outbound → Shipping · To-ship desk.
 * `/dashboard` (and outbound lifecycle bookmarks) → `/shipping/orders`.
 * Sales (`?mode=sales|pickup|repairs`) and other front doors stay elsewhere.
 */
function resolveDashboardOutboundRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/dashboard' && url.pathname !== '/dashboard/') return null;
  const mode = String(url.searchParams.get('mode') || '').trim().toLowerCase();
  if (
    mode === 'sales' ||
    mode === 'pickup' ||
    mode === 'repairs' ||
    mode === 'inbound' ||
    mode === 'receiving' ||
    mode === 'search'
  ) {
    return null;
  }
  // Legacy warranty / fba presence flags still client-redirect on the dashboard.
  if (url.searchParams.has('warranty') || url.searchParams.has('fba')) return null;
  const next = url.clone();
  next.pathname = '/shipping/orders';
  next.searchParams.delete('mode');
  return next;
}

/**
 * Support › Inquiries → shared To-ship desk with support context.
 * `/support?mode=orders` → `/shipping/orders?context=support`.
 */
function resolveSupportOrdersRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/support' && url.pathname !== '/support/') return null;
  const mode = String(url.searchParams.get('mode') || '').trim().toLowerCase();
  if (mode !== 'orders') return null;
  const next = url.clone();
  next.pathname = '/shipping/orders';
  next.searchParams.delete('mode');
  next.searchParams.set('context', 'support');
  return next;
}

/** Walk-In job-switcher redirect. */
function resolveWalkInJobRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/pickup' && url.pathname !== '/pickup/') return null;
  const job = url.searchParams.get('job');
  if (job === null) return null;
  const next = url.clone();
  next.pathname = job === 'repair' ? '/repair' : job === 'sales' ? '/walk-in' : '/pickup';
  next.searchParams.delete('job'); // the route IS the mode now
  return next;
}

/** Sales-hub Repair mode redirect (dual-door RepairCardList). */
function resolveWalkInRepairModeRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/walk-in' && url.pathname !== '/walk-in/') return null;
  const mode = url.searchParams.get('mode');
  const category = url.searchParams.get('category');
  const isRepair =
    mode === 'repair' || mode === 'repairs' || category === 'repair' || category === 'repairs';
  if (!isRepair) return null;
  const hasTaskKey =
    url.searchParams.has('new') || url.searchParams.has('openRepair');
  const next = url.clone();
  next.searchParams.delete('mode');
  next.searchParams.delete('category');
  if (hasTaskKey) {
    next.pathname = '/repair';
    return next;
  }
  next.pathname = '/dashboard';
  next.searchParams.set('mode', 'repairs');
  return next;
}

/** Pack-surface redirect (operator-surfaces refactor Phase 7). */
function resolvePackSurfaceRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/packer' && url.pathname !== '/packer/') return null;
  const next = url.clone();
  next.pathname = '/pack';
  // Packing is desktop-only (2026-09-14): phones get the desktop /pack page too.
  return next;
}

/** Test-surface redirect (operator-surfaces refactor Phase 8). */
function resolveTestSurfaceRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/tech' && url.pathname !== '/tech/') return null;
  const next = url.clone();
  next.pathname = '/test';
  if (next.searchParams.get('view') === 'testing-history') {
    next.searchParams.set('view', 'testing');
  }
  return next;
}

/**
 * Shipping-surface redirect. The shipping station lives at `/shipping` only —
 * there is no `/outbound` page. Bare `/outbound` (and `/outbound/`) 308 to
 * `/shipping`, preserving `?mode=` / FBA params for bookmarks and printed links.
 */
function resolveShippingSurfaceRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/outbound' && url.pathname !== '/outbound/') return null;
  const next = url.clone();
  next.pathname = '/shipping';
  return next;
}

/**
 * Legacy top-level History mode (`?view=testing-history`) now redirects to
 * Testing mode — the tested-lines browse surface is the empty state of
 * TestingLineWorkspace when no line is selected.
 */
function resolveTestingHistoryViewRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  if (url.pathname !== '/test' && url.pathname !== '/test/') return null;
  if (url.searchParams.get('view') !== 'testing-history') return null;
  const next = url.clone();
  next.searchParams.set('view', 'testing');
  return next;
}

// Per-section browse filters — mirrors SYSTEM_SAVED_VIEWS in `src/lib/operations/saved-view-presets.ts`, INLINED here to keep the Edge…
const AUDIT_LOG_SECTION_PARAMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  receiving: { stations: 'RECEIVING', sources: 'sal,inventory', view: 'sys:receiving-audit' },
  packing: { stations: 'PACK', view: 'sys:pack-audit' },
  tech: { stations: 'TECH', view: 'sys:tech-audit' },
};

/** Redirect a legacy `/audit-log/*` URL to its Operations History equivalent (plan §4.1), preferring a system saved-view preset and… */
function resolveAuditLogRedirect(url: NextRequest['nextUrl']): NextRequest['nextUrl'] | null {
  const p = url.pathname;
  if (p !== '/audit-log' && !p.startsWith('/audit-log/')) return null;

  const section =
    p === '/audit-log' || p === '/audit-log/'
      ? ''
      : p.slice('/audit-log/'.length).replace(/\/+$/, '');
  const src = url.searchParams;
  const next = url.clone();
  next.pathname = '/operations';
  const sp = next.searchParams;
  for (const k of [...sp.keys()]) sp.delete(k); // drop audit-log-specific params
  sp.set('mode', 'history');

  const preset = AUDIT_LOG_SECTION_PARAMS[section];
  if (preset) for (const [k, v] of Object.entries(preset)) sp.set(k, v);

  switch (section) {
    case 'trace': {
      const serial = src.get('serial');
      const tracking = src.get('tracking');
      const order = src.get('order');
      if (serial) {
        sp.set('dim', 'serial');
        sp.set('serial', serial);
      } else if (tracking) {
        sp.set('dim', 'tracking');
        sp.set('tracking', tracking);
      } else if (order) {
        sp.set('dim', 'order');
        sp.set('order', order);
      }
      break;
    }
    case 'receiving': {
      const po = src.get('po');
      if (po) sp.set('q', po);
      break;
    }
    case 'packing': {
      const tracking = src.get('tracking');
      if (tracking) {
        sp.set('dim', 'tracking');
        sp.set('tracking', tracking);
      }
      break;
    }
    case 'tech': {
      const session = src.get('session') ?? src.get('staffId');
      if (session && /^\d+$/.test(session)) sp.set('staffId', session);
      break;
    }
    case 'sku': {
      const sku = src.get('sku');
      if (sku) sp.set('q', sku);
      break;
    }
    // '' (bare /audit-log), 'staff', or any other section → plain History landing.
  }
  return next;
}

/**
 * Security response headers.
 * Security response headers. Attached to every response we hand back from
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

function applySkewPinCookie(req: NextRequest, res: NextResponse): void {
  const kioskHost = isKioskHost(req.headers.get('host'));
  const existingVdpl = req.cookies.get(VDPL_COOKIE)?.value;
  // Staff URLs are deliberately unpinned. Clear any cookie issued by the old
  // policy as soon as the request reaches the current deployment.
  if (!kioskHost) {
    if (existingVdpl) {
      res.cookies.set(VDPL_COOKIE, '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.VERCEL === '1' || req.nextUrl.protocol === 'https:',
        maxAge: 0,
      });
    }
    return;
  }
  const decision = skewPinDecision({
    skewProtectionEnabled: process.env.VERCEL_SKEW_PROTECTION_ENABLED,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    existingVdpl,
    isKioskHost: kioskHost,
  });
  if (!decision.pin) return;
  res.cookies.set(VDPL_COOKIE, decision.deploymentId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.VERCEL === '1' || req.nextUrl.protocol === 'https:',
    maxAge: VDPL_MAX_AGE_SEC,
  });
}

function applySecurityHeaders(req: NextRequest, res: NextResponse): NextResponse {
  applySkewPinCookie(req, res);
  // Fast production triage: the document/API response says exactly which
  // immutable build served it. Two staff hostnames must report the same value
  // immediately after a hard refresh following deployment.
  res.headers.set(
    'X-CycleForge-Deployment',
    process.env.VERCEL_DEPLOYMENT_ID?.trim() || 'development',
  );
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
  // Mirrors `readV1BearerSid` (lib/auth/session.ts — not importable here: it pulls the DB pool).
  const hasV1Bearer =
    pathname.startsWith('/api/v1/') && /^Bearer\s+\S+/i.test(req.headers.get('authorization') ?? '');

  // ── Kiosk host surface (`{slug}.kiosk.app.cycleforge.ai`) ─────────────────
  // Hard isolation: only the intake UI + device-authed kiosk APIs. Staff
  // enroll/revoke/devices and every other app path → 404 (no chrome leak).
  if (isBareKioskPlatformHost(hostHeader)) {
    return applySecurityHeaders(req, 
      pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
        : new NextResponse('Not Found', { status: 404 }),
    );
  }

  if (isKioskHost(hostHeader)) {
    if (!isKioskHostAllowedPath(pathname)) {
      return applySecurityHeaders(req, 
        pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
          : new NextResponse('Not Found', { status: 404 }),
      );
    }

    const requestHeaders = new Headers(req.headers);
    const tenantSlug = extractTenantSlug(hostHeader);
    if (tenantSlug) {
      requestHeaders.set('x-tenant-slug', tenantSlug);
    }

    // MDM pins the origin root — rewrite `/` → `/kiosk`.
    const effectivePath = pathname === '/' ? '/kiosk' : pathname;
    requestHeaders.set('x-pathname', effectivePath);

    if (pathname === '/') {
      const url = req.nextUrl.clone();
      url.pathname = '/kiosk';
      return applySecurityHeaders(req, 
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
      );
    }

    return applySecurityHeaders(req, 
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  // Path-prefix rewrites take precedence; UA-based rewrites are a fallback
  // for exact paths with a /m/* counterpart (see MOBILE_UA_REWRITES).
  const rewriteTarget =
    resolveRewrite(pathname) ?? resolveMobileUaRewrite(pathname, req.headers.get('user-agent'));

  // Pass the resolved pathname to RSC pages — used by requirePermission to
  // build a `?next=` query when it redirects to /signin.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', rewriteTarget ?? pathname);
  // …and the query beside it.
  requestHeaders.set('x-search', req.nextUrl.search);

  // Stamp the tenant slug (if any) so downstream handlers can resolve the
  // org without re-parsing the host header. The slug is just a hint —
  // the authoritative org id always comes from the session.
  const tenantSlug = extractTenantSlug(hostHeader);
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }

  // Staff-host `/kiosk*` → tenant kiosk origin (308) once subdomain DNS is live.
  // While `kioskPathDogfoodActive()` (HUMAN-TODO J7b pending), serve the path on
  // the staff host so tablets can use `https://app.cycleforge.ai/kiosk/v2`.
  if (
    !kioskPathDogfoodActive() &&
    (pathname === '/kiosk' || pathname.startsWith('/kiosk/'))
  ) {
    const kioskDest = staffKioskRedirectOrigin({
      tenantSlug,
      defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG,
      isProduction: process.env.NODE_ENV === 'production',
    });
    if (kioskDest) {
      // Preserve path so staff same-origin preview `/kiosk/v2` lands on the
      // tenant kiosk shell, not the kiosk root.
      return applySecurityHeaders(req, NextResponse.redirect(new URL(`${kioskDest}${pathname}`), 308));
    }
    if (process.env.NODE_ENV === 'production') {
      const url = req.nextUrl.clone();
      url.pathname = '/signin';
      url.searchParams.set('next', '/kiosk');
      url.searchParams.set('reason', 'kiosk-workspace');
      return applySecurityHeaders(req, NextResponse.redirect(url));
    }
  }

  const applyRewriteOrNext = (): NextResponse => {
    if (rewriteTarget) {
      const url = req.nextUrl.clone();
      url.pathname = rewriteTarget;
      return applySecurityHeaders(req, NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }
    return applySecurityHeaders(req, NextResponse.next({ request: { headers: requestHeaders } }));
  };

  // Normalize legacy receiving-surface URLs to their first-class routes
  // (`/receiving` → `/unbox`, `?mode=triage` → `/triage`). Desktop only —
  // phones fall through to the `/m/*` rewrite computed above (rewriteTarget set).
  if (!rewriteTarget) {
    const surfaceRedirect =
      resolveAuditLogRedirect(req.nextUrl) ??
      resolveReceivingSurfaceRedirect(req.nextUrl) ??
      resolveReceivingHistoryRedirect(req.nextUrl) ??
      resolveDashboardInboundRedirect(req.nextUrl) ??
      resolveShippedDeskRedirect(req.nextUrl) ??
      resolveDashboardOutboundRedirect(req.nextUrl) ??
      resolveSupportOrdersRedirect(req.nextUrl) ??
      resolveWalkInJobRedirect(req.nextUrl) ??
      resolveWalkInRepairModeRedirect(req.nextUrl) ??
      resolvePackSurfaceRedirect(req.nextUrl) ??
      resolveTestSurfaceRedirect(req.nextUrl) ??
      resolveShippingSurfaceRedirect(req.nextUrl) ??
      resolveTestingHistoryViewRedirect(req.nextUrl);
    if (surfaceRedirect) {
      return applySecurityHeaders(req, NextResponse.redirect(surfaceRedirect));
    }
  }

  if (isPublic(pathname)) {
    return applyRewriteOrNext();
  }

  // Development-only visual study. Its page returns 404 in production; this
  // exception only makes the local preview reachable without an auth session.
  if (process.env.NODE_ENV !== 'production' && pathname === '/motion-plus-button') {
    return applyRewriteOrNext();
  }

  // Break-glass off: never block. Default: redirect HTML routes / 401 JSON.
  if (!hasCookie && !hasV1Bearer && isAuthV2Enabled()) {
    const isApi = pathname.startsWith('/api/');
    if (isApi) {
      return applySecurityHeaders(
        req,
        pathname.startsWith('/api/v1/')
          ? v1Error(401, 'UNAUTHENTICATED', 'Sign in required.')
          : NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return applySecurityHeaders(req, NextResponse.redirect(url));
  }

  return applyRewriteOrNext();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files; the regex
    // PUBLIC_PATHS above does the fine-grained allowlist.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
