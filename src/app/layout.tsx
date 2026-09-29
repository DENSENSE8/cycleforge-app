import "./globals.css";
/** The shell branch (public chrome vs the warehouse client) lives in a CLIENT component on purpose: */
import { AppShellSwitch } from "@/components/layout/AppShellSwitch";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import { STATION_SKIN_BOOT_SCRIPT } from "@/lib/theme/station-skin";
import { STATION_DEPTH_BOOT_SCRIPT } from "@/lib/theme/station-depth";
import { designTokenStyleText } from '@/styles/tokens';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import { stationSkinStyleText } from '@/design-system/themes/station-skins';
import { stationDepthStyleText } from '@/design-system/themes/station-depths';
import { modeRegistryStyleText } from '@/design-system/modes/registry';
import { aiSystemStyleText } from '@/design-system/ai/tokens';
import { TRIAL_BOOT_SCRIPT } from '@/lib/design/trials';
// `MotionConfig`, so a static import in this file shipped the Motion runtime
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
import { PaintTimingHud } from "@/components/dev/PaintTimingHud";
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

    // Signed-out public entry surfaces (`/signin`, `/signup`, share links) get a MINIMAL provider tree — see `public-chrome-paths.ts`.
    // Local-only visual studies must not pay for the authenticated warehouse
    // shell (and are 404s in production at their page boundary).
    const localVisualStudy = process.env.NODE_ENV !== 'production' && pathname === '/motion-plus-button';
    const publicChrome = localVisualStudy || (!initialUser && isPublicChromePath(pathname));
    // `/m/*` is the handheld tree.
    const mobileTree = pathname === '/m' || pathname.startsWith('/m/');

    // Paint seed for routes whose first-paint content lives in the SHELL rather than the page (Unbox recents rail; the Testing station's…
    const shellSeed = await shellSeedPromise;

    // Activation gate — covers desks that skip `requirePermission` (e.g. `/`,
    // `/incoming`). Exempt paths + fail-open live in activation-gate.ts.
    if (initialUser && !kioskHost) {
      if (await isActivationBlocked(initialUser.organizationId, pathname)) {
        redirect(ACTIVATION_REDIRECT_HREF);
      }
    }

    // suppressHydrationWarning on <html>:
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
                {/* Viewport — cover the notch. */}
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                {/* URL-only design trial flags; never persisted. */}
                <script dangerouslySetInnerHTML={{ __html: TRIAL_BOOT_SCRIPT }} />
                <style id="app-design-tokens">{designTokenStyleText}</style>
                {/* Generated theme palettes (light/dark/mono/slate + staff
                    accents) from the theme registry — the single owner of every
                    theme-varying --ds-color-* variable. */}
                <style id="app-theme-palettes">{themePaletteStyleText}</style>
                <style id="app-station-skins">{stationSkinStyleText}</style>
                <style id="app-station-depths">{stationDepthStyleText}</style>
                {/* Task-mode regions (`data-mode`, via ModeRegion) — after the
                    theme palettes because a light-scheme region remaps their
                    neutral --ds-color-* vars. */}
                <style id="app-mode-registry">{modeRegistryStyleText}</style>
                {/* AI design system (`@/design-system/ai`) — its own palette,
                    corners, prose scale and measure; after the mode registry
                    because `[data-ai-surface]` remaps the neutral vars again. */}
                <style id="app-ai-system">{aiSystemStyleText}</style>
                {/* Applies the cached theme before paint (no light→dark flash). */}
                <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
                <script dangerouslySetInnerHTML={{ __html: STATION_SKIN_BOOT_SCRIPT }} />
                <script dangerouslySetInnerHTML={{ __html: STATION_DEPTH_BOOT_SCRIPT }} />
                {/* Evict leftover Warehouse-OS Workbox CacheFirst on this
                    origin (usav-dev / localhost:3050) so Home CSS can paint. */}
                <script
                  dangerouslySetInnerHTML={{
                    __html:
                      "(function(){try{if(!('serviceWorker' in navigator))return;navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}}catch(e){}})();",
                  }}
                />
            </head>
            <body className={`${cfSans.className} antialiased m-0 overflow-hidden ${appChromeClass}`}>
                {/* Pin the app to the visual viewport. */}
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
            </body>
        </html>
    );
}
