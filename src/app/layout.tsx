import "./globals.css";
/**
 * The shell branch (public chrome vs the warehouse client) lives in a CLIENT
 * component on purpose: `next/dynamic` called from a Server Component does not
 * create a lazy client boundary under Turbopack, so the warehouse chunk shipped
 * to `/signin` even though the public branch rendered. See `AppShellSwitch`.
 */
import { AppShellSwitch } from "@/components/layout/AppShellSwitch";
import { ReskinHud } from '@/components/design-lab/ReskinHud';
import { StationStateTester } from '@/components/qa/StationStateTester';
import { PaintTimingHud } from "@/components/dev/PaintTimingHud";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import { STATION_SKIN_BOOT_SCRIPT } from "@/lib/theme/station-skin";
import { STATION_DEPTH_BOOT_SCRIPT } from "@/lib/theme/station-depth";
import { BOOT_SPLASH_SCRIPT } from "@/lib/boot-splash-script";
import { designTokenStyleText } from '@/styles/tokens';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import { stationSkinStyleText } from '@/design-system/themes/station-skins';
import { stationDepthStyleText } from '@/design-system/themes/station-depths';
import { reskinStyleText } from '@/design-system/themes/reskin';
import { RESKIN_BOOT_SCRIPT } from '@/lib/theme/reskin';
import { isDesignLabOrg, resolveDesignLabAccess } from '@/lib/design-lab/access';
// NOTE: `ReducedMotionProvider` is deliberately NOT imported here. It renders
// `MotionConfig`, so a static import in this file shipped the framer runtime
// (~104KB gz) to every route, public chrome included. It now lives inside
// `WarehouseShell`, which is already behind `next/dynamic` — see the note there.
import { getInitialAuthUser } from "@/lib/auth/server-session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isKioskHost, isKioskUiPath } from "@/lib/tenancy/kiosk-host";
import { isPublicChromePath } from "@/lib/auth/public-chrome-paths";
import {
  ACTIVATION_REDIRECT_HREF,
  isActivationBlocked,
} from "@/lib/onboarding/activation-gate";
import { DeferredWebTelemetry } from "@/components/analytics/DeferredWebTelemetry";
import { maybeSeedShell } from "@/lib/queries/unbox-shell-seed.server";
import { PRODUCT_NAME } from "@/lib/branding/constants";
import { cfSans, cfSansItalic, ibmPlexMono, ibmPlexSansCondensed } from "@/lib/fonts";
import { appChromeClass } from "@/design-system/tokens/app-surface";

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const h = await headers();
    const pathname = h.get('x-pathname') || '/';
    const search = h.get('x-search') || '';
    const kioskHost = isKioskHost(h.get('host')) || isKioskUiPath(pathname);

    // Start the paint seed BEFORE awaiting auth so they overlap (~0.4s TTFB).
    // Auth is not on the critical path once parallel; TTFB is on LCP for /unbox.
    const shellSeedPromise = maybeSeedShell(pathname, search);

    const initialUser = await getInitialAuthUser();
    // Signed-out / first paint: platform brand only. Signed-in: the workspace
    // takes over the tab (per-page "{Page} · {org}" titles are set client-side
    // by each route as they adopt it — see docs/cycle-forge-branding-spec.md §3).
    const documentTitle = initialUser ? initialUser.organizationName : PRODUCT_NAME;

    // Signed-out public entry surfaces (`/signin`, `/signup`, share links) get
    // a MINIMAL provider tree — see `public-chrome-paths.ts`. The full stack
    // below exists to run a warehouse; none of it is reachable from a sign-in
    // card, and mounting it made the one public route in the app pay for the
    // whole operator client before it could paint a password field.
    const publicChrome = !initialUser && isPublicChromePath(pathname);
    // `/m/*` is the handheld tree. The edge proxy only ever serves those paths
    // to phones, so this is a routing fact the server already knows — deciding
    // it here (rather than from client-side device detection) is what lets the
    // two frames be separate chunks; see `WarehouseShell`.
    const mobileTree = pathname === '/m' || pathname.startsWith('/m/');

    // Paint seed for routes whose first-paint content lives in the SHELL rather
    // than the page (Unbox recents rail; the Testing station's Ready-to-Pack
    // grid + KPI band, whose keys the left rail mounts first). `null` on every
    // other route.
    const shellSeed = await shellSeedPromise;

    // QA Design Lab entitlement. Short-circuits on the org id, so every other
    // tenant pays one string compare and ships NONE of the reskin bytes — no
    // override stylesheet, no boot script, no HUD. See lib/design-lab/access.ts.
    const designLab = await resolveDesignLabAccess(initialUser?.organizationId);

    // Activation gate — covers desks that skip `requirePermission` (e.g. `/`,
    // `/incoming`). Exempt paths + fail-open live in activation-gate.ts.
    if (initialUser && !kioskHost) {
      if (await isActivationBlocked(initialUser.organizationId, pathname)) {
        redirect(ACTIVATION_REDIRECT_HREF);
      }
    }

    // suppressHydrationWarning on <html>: THEME_BOOT_SCRIPT (in <head> below)
    // stamps data-theme / data-color-scheme on <html> before hydration to avoid a
    // theme flash, so the SSR markup (no attrs) intentionally differs from the
    // booted DOM. The flag is scoped to this one element's attributes.
    return (
        <html
            lang="en"
            className={`${cfSans.variable} ${cfSansItalic.variable} ${ibmPlexSansCondensed.variable} ${ibmPlexMono.variable} h-full overflow-hidden`}
            suppressHydrationWarning
        >
            <head>
                <title>{documentTitle}</title>
                <meta name="description" content={`${PRODUCT_NAME} — Reseller Operations`} />
                <link rel="icon" type="image/png" href="/favicon.png" />
                {/* PWA */}
                <link rel="manifest" href="/manifest.json" />
                <meta name="application-name" content={PRODUCT_NAME} />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content={PRODUCT_NAME} />
                <meta name="theme-color" content="#ffffff" />
                <meta name="mobile-web-app-capable" content="yes" />
                {/* Viewport — cover the notch. NO `maximum-scale`: pinning it
                    to 1 disables pinch-zoom entirely, which fails WCAG 1.4.4
                    (Resize Text) and axe `meta-viewport` on EVERY route — 10
                    points of the Accessibility score app-wide. It was there to
                    stop iOS auto-zooming on input focus, but that is already
                    handled properly by the `pointer: coarse` 16px font floor in
                    globals.css (iOS only zooms a field under 16px), so the lock
                    was redundant belt-and-braces that cost real users zoom. */}
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <style id="app-design-tokens">{designTokenStyleText}</style>
                {/* Generated theme palettes (light/dark/mono/slate + staff
                    accents) from the theme registry — the single owner of every
                    theme-varying --ds-color-* variable. */}
                <style id="app-theme-palettes">{themePaletteStyleText}</style>
                <style id="app-station-skins">{stationSkinStyleText}</style>
                <style id="app-station-depths">{stationDepthStyleText}</style>
                {/* Design Lab reskin override layer. MUST come after
                    app-theme-palettes: `html[data-reskin]` ties
                    `html[data-theme]` on specificity and wins on source order. */}
                {designLab && <style id="app-reskin">{reskinStyleText}</style>}
                {/* Applies the cached theme before paint (no light→dark flash). */}
                <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
                <script dangerouslySetInnerHTML={{ __html: STATION_SKIN_BOOT_SCRIPT }} />
                <script dangerouslySetInnerHTML={{ __html: STATION_DEPTH_BOOT_SCRIPT }} />
                {designLab && (
                  <script dangerouslySetInnerHTML={{ __html: RESKIN_BOOT_SCRIPT }} />
                )}
                {/* Evict leftover Warehouse-OS Workbox CacheFirst on this
                    origin (usav-dev / localhost:3050) so Home CSS can paint. */}
                <script
                  dangerouslySetInnerHTML={{
                    __html:
                      "(function(){try{if(!('serviceWorker' in navigator))return;navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}}catch(e){}})();",
                  }}
                />
                {/* Paints the loading splash before hydration on a fresh sign-in
                    (one-shot flag), bridging the white gap until <BootGate> mounts
                    its own splash. Without this the dashboard's first paint is a
                    blank shell and the splash flickers off and back on. */}
                <script dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
            </head>
            <body className={`${cfSans.className} antialiased m-0 overflow-hidden ${appChromeClass}`}>
                {/*
                  Pin the app to the visual viewport. Body must NOT carry safe-area
                  padding or min-height:100vh — both caused first-load gaps (URL bar
                  vs dvh) and clipped the mobile header when nested shells also used
                  100dvh / h-full. Safe areas live on mobile chrome instead.
                */}
                <AppShellSwitch
                  publicChrome={publicChrome}
                  initialUser={initialUser}
                  kioskHost={kioskHost}
                  mobileTree={mobileTree}
                  shellSeed={shellSeed}
                >
                  {children}
                </AppShellSwitch>
                <DeferredWebTelemetry />
                <PaintTimingHud />
                {designLab && <ReskinHud />}
                {isDesignLabOrg(initialUser?.organizationId) && <StationStateTester />}
            </body>
        </html>
    );
}
