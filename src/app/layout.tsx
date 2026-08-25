import "./globals.css";
import Providers from "../components/Providers";
import dynamic from "next/dynamic";

/**
 * The warehouse client, code-split. A STATIC import here would put every
 * provider in the bundle of every route this layout renders — including the
 * signed-out `/signin` card, which renders none of them. This is a code-split,
 * not `ssr: false`: the shell still server-renders.
 */
const WarehouseShell = dynamic(() =>
  import("@/components/layout/WarehouseShell").then((m) => m.WarehouseShell),
);
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import { BOOT_SPLASH_SCRIPT } from "@/lib/boot-splash-script";
import { designTokenStyleText } from '@/styles/tokens';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import { ReducedMotionProvider } from "../components/providers/ReducedMotionProvider";
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
import { cfSans, cfSansItalic, ibmPlexMono, ibmPlexSansCondensed, overpass } from "@/lib/fonts";
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
            className={`${cfSans.variable} ${cfSansItalic.variable} ${ibmPlexSansCondensed.variable} ${ibmPlexMono.variable} ${overpass.variable} h-full overflow-hidden`}
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
                {/* Viewport — cover notch, prevent zoom on input focus */}
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
                <style id="app-design-tokens">{designTokenStyleText}</style>
                {/* Generated theme palettes (light/dark/mono/slate + staff
                    accents) from the theme registry — the single owner of every
                    theme-varying --ds-color-* variable. */}
                <style id="app-theme-palettes">{themePaletteStyleText}</style>
                {/* Applies the cached theme before paint (no light→dark flash). */}
                <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
                {/*
                  App-wide reduced-motion floor. framer itself honors
                  prefers-reduced-motion for every motion.* below this point, so
                  compliance is the default rather than a per-call-site opt-in.
                  Wraps InstallPrompt too — it animates and sits outside Providers.
                */}
                <ReducedMotionProvider>
                {publicChrome ? (
                  /*
                    PUBLIC CHROME — signed-out entry surfaces only. `Providers`
                    is the floor the card genuinely uses (query client, toaster,
                    confirm host, tooltips); the whole warehouse client below is
                    skipped, and because it is behind `next/dynamic` it is not
                    downloaded either. The `<div id="app-root">` box is identical,
                    so the page's own layout is unchanged.
                  */
                  <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
                    <Providers publicChrome>{children}</Providers>
                  </div>
                ) : (
                  <WarehouseShell
                    initialUser={initialUser}
                    kioskHost={kioskHost}
                    mobileTree={mobileTree}
                    shellSeed={shellSeed}
                  >
                    {children}
                  </WarehouseShell>
                )}
                </ReducedMotionProvider>
                <DeferredWebTelemetry />
                <PaintTimingHud />
            </body>
        </html>
    );
}
