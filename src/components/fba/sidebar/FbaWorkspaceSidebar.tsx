'use client';

import {
  receivingScanBandClass,
} from '@/components/layout/header-shell';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import { FbaWorkspaceScanField } from '@/components/fba/sidebar/FbaWorkspaceScanField';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import {
  useFbaStationIdentity,
  useFbaWorkspaceBridges,
  useFbaWorkspaceUrlState,
} from '@/components/fba/sidebar/fba-workspace-hooks';

/** Suspense fallback for the /fba workspace sidebar. */
export function FbaWorkspaceSidebarFallback() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      <SkeletonBase height="2.5rem" className="rounded-none bg-surface-canvas" />
    </div>
  );
}

/**
 * The /fba intake sidebar. Persisted plans, shipments, and packed records stay
 * in the central workspace; the left column owns FNSKU scan intake only.
 */
export function FbaWorkspaceSidebar() {
  const { activeMode } = useFbaWorkspaceUrlState();
  const { staffId, staffName, stationTheme } = useFbaStationIdentity();
  const { editorActive } = useFbaWorkspaceBridges(activeMode);

  const isBoard = activeMode === 'combine' || activeMode === 'plan';
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      {/* Scan bar — pinned at the top of the working area so it never scrolls away. */}
      {isBoard && !editorActive && (
        // Same 40px scan band geometry as testing / packing sidebars — Motion
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

    </div>
  );
}
