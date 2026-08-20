import "./globals.css";
import Providers from "../components/Providers";
import { ResponsiveLayout } from "../components/layout/ResponsiveLayout";
import { HeaderProvider } from "../contexts/HeaderContext";
import { FbaWorkspaceProvider } from "../contexts/FbaWorkspaceContext";
import { StudioWorkspaceProvider } from "../components/studio/StudioWorkspaceContext";
import { AuthProvider } from "../contexts/AuthContext";
import { ActivityInboxProvider } from "../contexts/ActivityInboxContext";
import { StaffColorsProvider } from "../contexts/StaffColorsProvider";
import { StaffSwitcherProvider } from "../contexts/StaffSwitcherContext";
import { SwitchStaffSheet } from "../components/auth/SwitchStaffSheet";
import { ScanHotkeySync } from "../components/scan/ScanHotkeySync";
import { ThemeSync } from "../components/theme/ThemeSync";
import { TimeFormatSync } from "../components/time-format/TimeFormatSync";
import { QuickAccessSync } from "../components/quick-access/QuickAccessSync";
import { AuthenticatedAblyProvider } from "../components/providers/AuthenticatedAblyProvider";
import { AssistantProvider } from "../components/assistant/AssistantProvider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/theme";
import { BOOT_SPLASH_SCRIPT } from "@/lib/boot-splash-script";
import { designTokenStyleText } from '@/styles/tokens';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import { ReducedMotionProvider } from "../components/providers/ReducedMotionProvider";
import { InstallPrompt } from "../components/station/InstallPrompt";
import { AppearanceApplier } from "../components/settings/AppearanceApplier";
import { ReceivingZohoSyncToaster } from "../components/receiving/ReceivingZohoSyncToaster";
import { UserIssueResolvedToaster } from "../components/providers/UserIssueResolvedToaster";
import { getInitialAuthUser } from "@/lib/auth/server-session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isKioskHost, isKioskUiPath } from "@/lib/tenancy/kiosk-host";
import {
  ACTIVATION_REDIRECT_HREF,
  isActivationBlocked,
} from "@/lib/onboarding/activation-gate";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PaintTimingHud } from "@/components/dev/PaintTimingHud";
import { PostHogProvider } from "../components/analytics/PostHogProvider";
import { ShellQuerySeed } from "@/components/providers/ShellQuerySeed";
import { maybeSeedShell } from "@/lib/queries/unbox-shell-seed.server";
import { PRODUCT_NAME } from "@/lib/branding/constants";
import { cfSans, ibmPlexMono, ibmPlexSansCondensed } from "@/lib/fonts";
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
            className={`${cfSans.variable} ${ibmPlexSansCondensed.variable} ${ibmPlexMono.variable} h-full overflow-hidden`}
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
                <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
                    <PostHogProvider>
                    <Providers>
                        <AuthProvider initial={initialUser} kioskHost={kioskHost}>
                            <AuthenticatedAblyProvider>
                                <ActivityInboxProvider>
                                <StaffColorsProvider>
                                <StaffSwitcherProvider>
                                    <HeaderProvider>
                                        <FbaWorkspaceProvider>
                                            <StudioWorkspaceProvider>
                                                <AssistantProvider>
                                                    {/* Station paint seed. It wraps the SHELL, not
                                                        the page, because the route's rail is a
                                                        sibling of `children` and renders first —
                                                        see `maybeSeedUnboxShell`. Null on every
                                                        other route, where this renders nothing. */}
                                                    <ShellQuerySeed state={shellSeed}>
                                                        <ResponsiveLayout kioskHost={kioskHost}>
                                                            {children}
                                                        </ResponsiveLayout>
                                                    </ShellQuerySeed>
                                                </AssistantProvider>
                                            </StudioWorkspaceProvider>
                                        </FbaWorkspaceProvider>
                                    </HeaderProvider>
                                    <ReceivingZohoSyncToaster />
                                    <UserIssueResolvedToaster />
                                    <SwitchStaffSheet />
                                    <ScanHotkeySync />
                                    <ThemeSync />
                                    <TimeFormatSync />
                                    <QuickAccessSync />
                                </StaffSwitcherProvider>
                                </StaffColorsProvider>
                                </ActivityInboxProvider>
                            </AuthenticatedAblyProvider>
                        </AuthProvider>
                    </Providers>
                    </PostHogProvider>
                </div>
                <InstallPrompt />
                <AppearanceApplier />
                </ReducedMotionProvider>
                <Analytics />
                <SpeedInsights />
                <PaintTimingHud />
            </body>
        </html>
    );
}
