'use client';

/** The warehouse client — every provider, sync and host that makes this app an operator workstation, in ONE lazily-loadable boundary. */

import { Suspense, type ReactNode } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Providers from '@/components/Providers';

/** The two route frames, each in its own chunk. */
const DesktopRouteShell = dynamic(() =>
  import('@/components/layout/DesktopRouteShell').then((m) => m.DesktopRouteShell),
);
const MobileRouteShell = dynamic(() =>
  import('@/components/layout/MobileRouteShell').then((m) => m.MobileRouteShell),
);
const WelcomeReplayButton = dynamic(() =>
  import('@/components/boot/WelcomeReplayButton').then((module) => module.WelcomeReplayButton),
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
import { RouteRealtimeMount } from '@/design-system/providers/RouteRealtimeMount';
import { WorkbenchCachePersistence } from '@/components/providers/WorkbenchCachePersistence';
import { GlobalDetailStackHost } from '@/components/detail-stacks/GlobalDetailStackHost';
import { DetailStackHistoryTracker } from '@/components/detail-stacks/DetailStackHistoryTracker';
import { InstallPrompt } from '@/components/station/InstallPrompt';
/** The app-wide reduced-motion floor lives HERE, not in the root layout. */
import { ReducedMotionProvider } from '@/components/providers/ReducedMotionProvider';
import { AppearanceApplier } from '@/components/settings/AppearanceApplier';
import { UserIssueResolvedToaster } from '@/components/providers/UserIssueResolvedToaster';
import { WatchedArrivalToaster } from '@/components/providers/WatchedArrivalToaster';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { ShellQuerySeed } from '@/components/providers/ShellQuerySeed';
import { WelcomeHost } from '@/components/boot/WelcomeHost';

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
                            {/* Station paint seed. */}
                            <ShellQuerySeed state={shellSeed}>
                              {mobileTree ? (
                                <MobileRouteShell>{children}</MobileRouteShell>
                              ) : (
                                <DesktopRouteShell>
                                  {children}
                                </DesktopRouteShell>
                              )}
                            </ShellQuerySeed>
                            <GlobalDetailStackHost />
                            <Suspense fallback={null}>
                              <DetailStackHistoryTracker />
                            </Suspense>
                          </StudioWorkspaceProvider>
                        </FbaWorkspaceProvider>
                      </HeaderProvider>
                      <UserIssueResolvedToaster />
                      <WatchedArrivalToaster />
                      <SwitchStaffSheet />
                      <CursorLabelLayer />
                      {/* The route's live layer — one subscription set per page (kiosk + public frames have none). */}
                      <RouteRealtimeMount />
                      <ScanHotkeySync />
                      <ThemeSync />
                      <TimeFormatSync />
                      <QuickAccessSync />
                      {/* Desktop only: the welcome plays over any desktop page (sign-in, staff switch, dev replay). */}
                      {!mobileTree && <WelcomeHost />}
                      {process.env.NODE_ENV !== 'production' && !mobileTree ? <WelcomeReplayButton /> : null}
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
