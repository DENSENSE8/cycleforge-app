'use client';

import { ReadyModeBody } from '@/components/outbound/ready/ReadyModeBody';
import { FbaFnskuScanToast } from '@/components/fba/sidebar/FbaFnskuScanToast';
import {
  receivingScanBandClass,
  sidebarHeaderBandClass,
  sidebarHeaderPillRowClass,
  SIDEBAR_GUTTER,
} from '@/components/layout/header-shell';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import { SidebarSection } from '@/components/layout/SidebarSection';
import { FbaWorkspaceScanField } from '@/components/fba/sidebar/FbaWorkspaceScanField';
import {
  FbaCombineRailBody,
  FbaCombineRailPills,
  FbaPlanRailBody,
  FbaPlanRailPills,
} from '@/components/fba/sidebar/FbaSidebarRails';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { sidebarSubBandClass } from '@/components/fba/sidebar/fba-sidebar-shared';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import {
  useFbaPlanData,
  useFbaRailViews,
  useFbaStationIdentity,
  useFbaWorkspaceBridges,
  useFbaWorkspaceUrlState,
} from '@/components/fba/sidebar/fba-workspace-hooks';

/** Suspense fallback for the /fba workspace sidebar. */
export function FbaWorkspaceSidebarFallback() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      <div className={sidebarHeaderBandClass}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border-soft">
          <SkeletonBase height="2.75rem" className="rounded-none bg-surface-canvas" />
          <SkeletonBase height="2.75rem" className="rounded-none bg-surface-canvas" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`${sidebarSubBandClass} ${SIDEBAR_GUTTER} py-2.5`}>
          <SkeletonBase height="6rem" className="rounded-2xl bg-surface-sunken" />
        </div>
        <div className={`min-h-0 flex-1 space-y-3 ${SIDEBAR_GUTTER} py-3 overflow-y-auto bg-surface-card`}>
          <SkeletonBase width="8rem" height="1rem" className="bg-surface-sunken" />
          <div className="space-y-2">
            <SkeletonBase height="4rem" className="rounded-xl bg-surface-canvas" />
            <SkeletonBase height="4rem" className="rounded-xl bg-surface-canvas" />
            <SkeletonBase height="4rem" className="rounded-xl bg-surface-canvas" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The /fba workspace sidebar: mode pills, the pinned FNSKU scan bar, the
 * plan / combine rails, and the shipped search + table. State and side effects
 * live in {@link fba-workspace-hooks}; this component is composition + layout.
 */
export function FbaWorkspaceSidebar() {
  const { activeMode, refreshToken } = useFbaWorkspaceUrlState();
  const { orgId, staffId, staffName, stationTheme } = useFbaStationIdentity();
  const { pendingPlans, plansError } = useFbaPlanData({ activeMode, refreshToken, orgId });
  const { planRailView, setPlanRailView, combineRailView, setCombineRailView } = useFbaRailViews();
  const { editorActive } = useFbaWorkspaceBridges(activeMode);

  const isBoard = activeMode === 'combine' || activeMode === 'plan';
  // Combine-only panels (selection + tracking pairing + active shipments) are
  // hidden in plan mode, which is just scan-to-add + the recent rail.
  const isCombine = activeMode === 'combine';

  // Plan / Combine / Shipped switching lives in the main-pane content chrome
  // (`FbaWorkspaceHeader`) — the old sidebar pill row was dead behind the
  // always-on master nav. The sidebar keeps ambient scan I/O + rails only.
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      {/* Scan bar — pinned at the top of the working area so it never scrolls
          away. The mode is locked per page: Plan on the plan page (FNSKU adds to
          today's plan, Plan button only) and Select on combine (FNSKU selects
          packed items, Select button only). */}
      {isBoard && !editorActive && (
        // Same 40px scan band geometry as testing / packing sidebars — Framer
        // glow host (focus/click + submit pulse) matches Unbox / Shipping.
        <ScanBandGlowHost themeColor={stationTheme} className={receivingScanBandClass}>
          <div className="min-w-0 flex-1">
            <FbaWorkspaceScanField
              staffName={staffName}
              staffId={staffId}
              showTrackingCard={false}
              scanMode={activeMode === 'plan' ? 'plan' : 'select'}
              sidebarHeaderBand
            />
          </div>
        </ScanBandGlowHost>
      )}

      {activeMode === 'plan' && !editorActive ? (
        <div className={sidebarHeaderPillRowClass}>
          <FbaPlanRailPills view={planRailView} onViewChange={setPlanRailView} />
        </div>
      ) : null}

      {isCombine ? (
        <div className={sidebarHeaderPillRowClass}>
          <FbaCombineRailPills view={combineRailView} onViewChange={setCombineRailView} />
        </div>
      ) : null}

      {/* Single scroll container */}
      <SidebarRailScrollport
        className="bg-surface-card"
        data-testid="fba-sidebar-scroll"
        scrollStyle={{ ['--fba-sticky-top' as string]: '38px' }}
      >
        {activeMode === 'plan' && !editorActive ? <FbaPlanRailBody view={planRailView} /> : null}

        {isCombine ? <FbaCombineRailBody view={combineRailView} stationTheme={stationTheme} /> : null}

        {/* Combine review + tracking pairing + active shipments now live in the
            center-right combine workspace on /fba?mode=combine (see fba/page.tsx).
            The sidebar keeps just the scan bar + Recent/Packed rails. */}

        {/* Shipped history table + its search moved to the main pane
            (FbaOutboundWorkspace Shipped tab + FbaWorkspaceHeader search). */}
        {activeMode === 'shipped' ? (
          <div className={`${SIDEBAR_GUTTER} py-3 text-sm text-text-soft`}>
            Shipped FBA shipments live in the main pane — filter them with the
            search in the top bar.
          </div>
        ) : null}

        {activeMode === 'ready' ? <ReadyModeBody /> : null}

        {/* Station FNSKU scan toast — hidden when editor is active */}
        {isBoard && !editorActive && (
          <FbaFnskuScanToast pendingPlans={pendingPlans} stationTheme={stationTheme} />
        )}

        {/* Plans error banner */}
        {plansError && (
          <SidebarSection className="my-2">
            <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-role-caption font-semibold text-red-700">
              {plansError}
            </div>
          </SidebarSection>
        )}
      </SidebarRailScrollport>
    </div>
  );
}
