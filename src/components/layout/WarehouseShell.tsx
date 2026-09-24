'use client';

/**
 * The warehouse client — every provider, sync and host that makes this app an
 * operator workstation, in ONE lazily-loadable boundary.
 *
 * ## Why it is a component and not inline in the root layout
 *
 * It used to be inline. The root layout then *statically imported* the whole
 * stack — auth, realtime, the activity inbox, staff colours, the assistant dock,
 * the responsive layout and its nav spine — which put all of it in the client
 * bundle of every route the layout renders, including the signed-out `/signin`
 * card that references none of it. Rendering the public branch conditionally did
 * not help: a static import is in the module graph whether or not the branch
 * runs, so the public route still downloaded and parsed the operator client
 * (measured: 857KB of script, 76 requests, ~700ms of script evaluation on the
 * mobile profile it is scored at).
 *
 * Behind `next/dynamic` the stack is its own chunk, requested only by the branch
 * that renders it. Public chrome asks for none of it.
 *
 * It still server-renders — this is a code-split, NOT `ssr: false`. Turning SSR
 * off here would blank the app's first paint, which is the exact regression the
 * pre-hydration gate in `DesktopRouteShell` was deleted for.
 */

import type { ReactNode } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Providers from '@/components/Providers';

/**
 * The two route frames, each in its own chunk.
 *
 * `mobileTree` is decided on the SERVER from the request path, so the pick is
 * deterministic — mobile is a routing decision in this app, not a width one, so
 * there is no device detection and no desktop→mobile flash. Both server-render;
 * neither is `ssr: false`.
 *
 * Note this split did not measurably shrink the phone's payload — see the
 * ruling in `MobileRouteShell`.
 */
const DesktopRouteShell = dynamic(() =>
  import('@/components/layout/DesktopRouteShell').then((m) => m.DesktopRouteShell),
);
const MobileRouteShell = dynamic(() =>
  import('@/components/layout/MobileRouteShell').then((m) => m.MobileRouteShell),
);
import { HeaderProvider } from '@/contexts/HeaderContext';
import { FbaWorkspaceProvider } from '@/contexts/FbaWorkspaceContext';
import { StudioWorkspaceProvider } from '@/components/studio/StudioWorkspaceContext';
import { AuthProvider, type AuthSessionUser } from '@/contexts/AuthContext';
import { ActivityInboxProvider } from '@/contexts/ActivityInboxContext';
import { StaffColorsProvider } from '@/contexts/StaffColorsProvider';
import { StaffSwitcherProvider } from '@/contexts/StaffSwitcherContext';
import { SwitchStaffSheet } from '@/components/auth/SwitchStaffSheet';
import { CursorLabelLayer } from '@/design-system/motion/CursorLabelLayer';
import { ScanHotkeySync } from '@/components/scan/ScanHotkeySync';
import { ThemeSync } from '@/components/theme/ThemeSync';
import { TimeFormatSync } from '@/components/time-format/TimeFormatSync';
import { QuickAccessSync } from '@/components/quick-access/QuickAccessSync';
import { AuthenticatedAblyProvider } from '@/components/providers/AuthenticatedAblyProvider';
import { WorkbenchCachePersistence } from '@/components/providers/WorkbenchCachePersistence';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import { InstallPrompt } from '@/components/station/InstallPrompt';
/**
 * The app-wide reduced-motion floor lives HERE, not in the root layout.
 *
 * `MotionConfig` is a framer component, so a static import of it in
 * `app/layout.tsx` put the whole motion runtime (~104KB gz across 5 chunks) on
 * the critical graph of EVERY route — including the public chrome family
 * (`/signin`, `/signin/reset`, `/signup`, `/share/**`), none of which mounts a
 * single framer component. Rendering it in one branch was not enough: the
 * static import is what ships the bytes.
 *
 * `WarehouseShell` is already behind `next/dynamic` and is not downloaded for
 * public chrome, so hosting the provider here gives the warehouse tree the
 * identical floor and gives the public routes none of the weight. It wraps
 * `InstallPrompt` too, exactly as the layout version did.
 *
 * Invariant this creates: **a public-chrome route may not use framer.** Import
 * primitives by deep path there, never through `@/design-system/primitives`
 * (the barrel re-exports seven engine-carrying primitives).
 */
import { ReducedMotionProvider } from '@/components/providers/ReducedMotionProvider';
import { AppearanceApplier } from '@/components/settings/AppearanceApplier';
import { UserIssueResolvedToaster } from '@/components/providers/UserIssueResolvedToaster';
import { WatchedArrivalToaster } from '@/components/providers/WatchedArrivalToaster';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';

export function WarehouseShell({
  initialUser,
  mobileTree,
  shellSeed,
  children,
}: {
  initialUser: AuthSessionUser | null;
  mobileTree: boolean;
  shellSeed: DehydratedState | null;
  children: ReactNode;
}) {
  return (
    <ReducedMotionProvider>
      <div id="app-root" className="fixed inset-0 flex min-h-0 flex-col overflow-hidden">
        <PostHogProvider>
          <Providers>
            <AuthProvider initial={initialUser}>
              {/* First child: restores the repair workbench cache before any
                  route renders its queries. */}
              <WorkbenchCachePersistence />
              <AuthenticatedAblyProvider>
                <ActivityInboxProvider>
                  <StaffColorsProvider>
                    <StaffSwitcherProvider>
                      <HeaderProvider>
                        <FbaWorkspaceProvider>
                          <StudioWorkspaceProvider>
                            <AssistantProvider>
                              {/* Station paint seed. It wraps the SHELL, not the
                                  page, because the route's rail is a sibling of
                                  `children` and renders first — see
                                  `maybeSeedUnboxShell`. Null on every other
                                  route, where this renders nothing. */}
                              <ShellQuerySeed state={shellSeed}>
                                {mobileTree ? (
                                  <MobileRouteShell>{children}</MobileRouteShell>
                                ) : (
                                  <DesktopRouteShell>
                                    {children}
                                  </DesktopRouteShell>
                                )}
                              </ShellQuerySeed>
                            </AssistantProvider>
                          </StudioWorkspaceProvider>
                        </FbaWorkspaceProvider>
                      </HeaderProvider>
                      <UserIssueResolvedToaster />
                      <WatchedArrivalToaster />
                      <SwitchStaffSheet />
                      <CursorLabelLayer />
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
        {/* In-flow bottom slot, not a fixed overlay: while the banner is up the
            route shell above shrinks, so sticky docks (repair workbench, ticket
            reply, confirm docks) sit above it instead of under it. */}
        <InstallPrompt />
      </div>
      <AppearanceApplier />
    </ReducedMotionProvider>
  );
}
