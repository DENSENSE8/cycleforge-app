'use client';

import { motion } from '@/design-system/motion';
import { AlertCircle, Loader2, Package } from '@/components/Icons';
import { StationScanBar, ThemedStationScanBar } from '@/components/station/scan-bar';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { useFbaStationInput, type StationFbaInputProps } from './station-input/useFbaStationInput';
import { FbaPendingPlanQueue } from './station-input/FbaPendingPlanQueue';
import { FbaPlanPreviewList } from './station-input/FbaPlanPreviewList';

export type { StationFbaInputProps };

/**
 * FBA station scan bar — same chrome as testing / packing sidebars:
 * {@link ThemedStationScanBar} (staff border + inset focus) when in the sidebar
 * band; no plan/select mode chips when the page locks `scanMode`; no paste chip
 * in the sidebar band (clipboard-over-focus ring was the right-rail glitch).
 */
export default function StationFbaInput(props: StationFbaInputProps) {
  const {
    showLabels = true,
    className = '',
    fbaScanOnly = false,
    scanMode,
    sidebarHeaderBand = false,
  } = props;

  const c = useFbaStationInput(props);
  const staffId = props.techStaffIdOverride ?? null;
  // Station card mount — rises into place (never left→right wipe).
  const scanPresence = useMotionPresence(framerPresence.stationCard);
  const scanTransition = useMotionTransition(framerTransition.stationCardMount);

  // Sidebar band: match packing/testing — themed bar, spinner-only right rail.
  // Standalone (non-band) keeps dual mode + paste for free-form plan stations.
  const useSidebarChrome = fbaScanOnly && sidebarHeaderBand;
  const showModeToggle = fbaScanOnly && !scanMode && !sidebarHeaderBand;

  const scanIcon = (
    <Package
      className={`h-[17px] w-[17px] ${
        fbaScanOnly ? c.workspaceChrome.fnskuScanIconClass : 'text-violet-600'
      }`}
    />
  );

  const busySpinner = c.busy ? (
    <Loader2
      className={`h-4 w-4 shrink-0 animate-spin ${
        fbaScanOnly ? c.workspaceChrome.savingSpinner : 'text-text-muted'
      }`}
    />
  ) : null;

  const scanField = useSidebarChrome ? (
    <ThemedStationScanBar
      staffId={staffId}
      value={c.inputValue}
      onChange={c.handleInputChange}
      onSubmit={c.handleFormSubmit}
      inputRef={c.inputRef}
      inputBorderClassName={c.scanOutlineClass}
      placeholder="FNSKU (X00…) or ASIN (B0…)"
      autoFocus={false}
      icon={scanIcon}
      // Match Unbox/Testing/Packing sidebar dock — not MasterNav deep inset.
      leadingColumn="rail"
      isResolving={c.busy}
      showModeButtons={false}
    />
  ) : (
    <StationScanBar
      value={c.inputValue}
      onChange={c.handleInputChange}
      onSubmit={c.handleFormSubmit}
      inputRef={c.inputRef}
      theme={c.stationTheme}
      inputBorderClassName={c.scanOutlineClass}
      placeholder={
        fbaScanOnly ? 'Amazon SKU / FNSKU (X00…) or ASIN (B0…)' : 'Amazon SKU, ASIN, tracking, Repair, serial'
      }
      autoFocus={false}
      hasRightContent={Boolean(busySpinner)}
      onPaste={fbaScanOnly && showModeToggle ? c.handleInputChange : undefined}
      icon={scanIcon}
      iconClassName=""
      inputClassName={
        fbaScanOnly
          ? undefined
          : '!py-2.5 !text-sm focus:border-b-violet-600 focus:ring-0' /* ds-allow-focus: identity/one-off hue or ring-0 */
      }
      showModeButtons={showModeToggle}
      visibleModes={['plan', 'select']}
      activeMode={c.fbaMode}
      onPlanMode={() => {
        c.setFbaMode('plan');
        c.setSelectResult(null);
      }}
      onSelectMode={() => {
        c.setFbaMode('select');
        c.setPlanHint(null);
        c.setFbaError(null);
        c.setPlanPreviewLines([]);
        c.clearPendingTodayPlan();
      }}
      rightContent={busySpinner}
    />
  );

  return (
    <div className={`${c.stackBelowScan ? 'space-y-2' : ''} ${className}`.trim()}>
      {showLabels ? (
        <>
          {fbaScanOnly ? (
            <p className="text-role-micro uppercase tracking-widest text-text-muted">
              Adding To Today Current Plan
            </p>
          ) : (
            <p className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">Station scan</p>
          )}
          <p className="text-role-caption leading-snug text-text-soft">
            {fbaScanOnly ? c.fbaOnlyHint : c.routingHint}
          </p>
        </>
      ) : null}

      <motion.div
        initial={scanPresence.initial}
        animate={scanPresence.animate}
        transition={scanTransition}
      >
        {fbaScanOnly && !sidebarHeaderBand ? (
          <ScanBandGlowHost themeColor={c.stationTheme}>{scanField}</ScanBandGlowHost>
        ) : (
          scanField
        )}
      </motion.div>

      {fbaScanOnly && (c.isFbaLoading || c.planHint || c.selectedCount > 0) ? (
        <div className="flex items-center gap-1.5">
          {c.isFbaLoading ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-text-faint" />
          ) : null}
          <p
            className={`text-role-micro font-semibold uppercase tracking-widest ${
              c.planHint
                ? 'text-emerald-600'
                : c.selectedCount > 0
                  ? 'text-blue-600'
                  : 'text-text-soft'
            }`}
          >
            {c.isFbaLoading
              ? 'Updating plan…'
              : c.planHint
                ? c.planHint
                : `${c.selectedCount} selected · ${c.selectedQty} unit${c.selectedQty !== 1 ? 's' : ''}`}
          </p>
        </div>
      ) : null}

      {fbaScanOnly && c.fbaMode === 'plan' && c.pendingTodayPlanRows && c.pendingTodayPlanRows.length > 0 ? (
        <FbaPendingPlanQueue
          rows={c.pendingTodayPlanRows}
          stationTheme={c.stationTheme}
          todayPlanQtyByFnsku={c.todayPlanQtyByFnsku}
          isLoading={c.isFbaLoading}
          touchesExistingLine={c.pendingTodayTouchesExistingLine}
          onPatchQty={c.patchPendingTodayQty}
          onCancel={c.clearPendingTodayPlan}
          onSubmit={(rows) => void c.handleBulkFnskuPlanFlow(rows)}
          onSetError={c.setFbaError}
        />
      ) : null}

      {!fbaScanOnly && c.planPreviewLines.length > 0 ? (
        <FbaPlanPreviewList
          lines={c.planPreviewLines}
          stationTheme={c.stationTheme}
          onPatchQty={(line, nextQty) => void c.patchPlanLineQty(line, nextQty)}
        />
      ) : null}

      {c.scanError ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-none border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-800"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 leading-snug">{c.scanError}</span>
        </div>
      ) : null}
    </div>
  );
}
