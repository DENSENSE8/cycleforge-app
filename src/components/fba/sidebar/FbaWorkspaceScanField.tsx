'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { AlertCircle, Loader2 } from '@/components/Icons';
import StationFbaInput from '@/components/fba/StationFbaInput';
import { useFbaWorkspace } from '@/contexts/FbaWorkspaceContext';
import {
  FBA_ID_RE,
  UPS_RE,
  normalizeFbaId,
  normalizeUps,
  persistAmazonShipmentId,
  persistUpsTracking,
} from '@/components/fba/sidebar/fbaShipmentTracking';
import { fbaWorkspaceScanChrome } from '@/utils/staff-colors';
import { useStationTheme } from '@/hooks/useStationTheme';
import { FBA_SCAN_STATUS, FBA_ACTIVE_SHIPMENTS_REFRESH } from '@/lib/fba/events';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { Button, TextField } from '@/design-system/primitives';
import { refreshDomain } from '@/lib/refresh/bus';

const TRACKING_PANEL_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const;

const PRINT_SIDEBAR_READY_EVENT = 'fba-print-sidebar-ready';

export interface FbaWorkspaceScanFieldProps {
  staffName: string;
  staffId?: number | string | null;
  scanEnabled?: boolean;
  showTrackingCard?: boolean;
  /** Locks the scan flow per page: 'plan' on the plan page, 'select' on combine. */
  scanMode?: 'plan' | 'select';
  /** Fit scan input inside the shared 40px sidebar header band. */
  sidebarHeaderBand?: boolean;
}

/** Sidebar: Welcome + FBA goal + scan, plus guarded plan pairing for the active print selection. */
export function FbaWorkspaceScanField({
  staffId = null,
  scanEnabled = true,
  showTrackingCard = true,
  scanMode,
  sidebarHeaderBand = false,
}: FbaWorkspaceScanFieldProps) {
  const { clearSelection, patchTracking, selection, trackingByPlan } = useFbaWorkspace();

  const effectiveStaffId = (() => {
    if (staffId != null && staffId !== '') {
      const n = Number(staffId);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  })();

  const { theme: stationTheme } = useStationTheme({ staffId: effectiveStaffId });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const trackingTransition = useMemo(
    () => (reduceMotion ? { duration: 0 } : framerTransition.stationSerialRow),
    [reduceMotion]
  );
  const scanChrome = fbaWorkspaceScanChrome[stationTheme];
  const selectedItems = selection.selectedItems;

  const selectedPlanIds = useMemo(
    () => {
      const ids = new Set<number>();
      for (const item of selectedItems) {
        const id = Number(item.plan_id ?? item.shipment_id ?? 0);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
      return Array.from(ids);
    },
    [selectedItems]
  );
  const activePlanId = selection.activePlanId;
  const trackingTargetPlanIds = selectedPlanIds.length > 0
    ? selectedPlanIds
    : activePlanId != null
      ? [activePlanId]
      : [];

  const readyByPlanId = useMemo(() => {
    const next: Record<number, boolean> = {};
    selectedPlanIds.forEach((planId) => {
      const tracking = trackingByPlan[planId] || { amazon: '', ups: '' };
      next[planId] =
        FBA_ID_RE.test(normalizeFbaId(tracking.amazon)) &&
        UPS_RE.test(normalizeUps(tracking.ups));
    });
    return next;
  }, [selectedPlanIds, trackingByPlan]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PRINT_SIDEBAR_READY_EVENT, {
        detail: {
          readyByPlanId,
          readyByShipmentId: readyByPlanId,
        },
      })
    );
  }, [readyByPlanId]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent(PRINT_SIDEBAR_READY_EVENT, {
          detail: {
            readyByPlanId: {},
            readyByShipmentId: {},
          },
        })
      );
    };
  }, []);

  const activeTracking = useMemo(() => {
    if (trackingTargetPlanIds.length === 0) return { amazon: '', ups: '' };
    const base = trackingByPlan[trackingTargetPlanIds[0]] ?? { amazon: '', ups: '' };
    const amazonShared = trackingTargetPlanIds.every(
      (planId) => (trackingByPlan[planId]?.amazon ?? '') === (base.amazon ?? '')
    );
    const upsShared = trackingTargetPlanIds.every(
      (planId) => (trackingByPlan[planId]?.ups ?? '') === (base.ups ?? '')
    );
    return {
      amazon: amazonShared ? base.amazon ?? '' : '',
      ups: upsShared ? base.ups ?? '' : '',
    };
  }, [trackingByPlan, trackingTargetPlanIds]);
  const amazonOk = trackingTargetPlanIds.length > 0 && FBA_ID_RE.test(normalizeFbaId(activeTracking.amazon));
  const upsOk = trackingTargetPlanIds.length > 0 && UPS_RE.test(normalizeUps(activeTracking.ups));
  const trackingReady =
    trackingTargetPlanIds.length > 0 && trackingTargetPlanIds.every((planId) => readyByPlanId[planId]);

  const setActiveTracking = useCallback(
    (patch: Partial<{ amazon: string; ups: string }>) => {
      if (trackingTargetPlanIds.length === 0) return;
      trackingTargetPlanIds.forEach((planId) => patchTracking(planId, patch));
    },
    [patchTracking, trackingTargetPlanIds]
  );

  const onSaveTracking = useCallback(async () => {
    if (trackingTargetPlanIds.length === 0) return;
    if (!amazonOk || !upsOk) return;
    setSaving(true);
    setSaveError(null);
    try {
      const normalizedAmazon = normalizeFbaId(activeTracking.amazon);
      const normalizedUps = normalizeUps(activeTracking.ups);
      const amazonResults = await Promise.all(
        trackingTargetPlanIds.map((planId) => persistAmazonShipmentId(planId, normalizedAmazon))
      );
      const upsResults = await Promise.all(
        trackingTargetPlanIds.map((planId) => persistUpsTracking(planId, normalizedUps))
      );
      if (amazonResults.some(Boolean)) {
        trackingTargetPlanIds.forEach((planId) => patchTracking(planId, { amazon: normalizedAmazon }));
      }
      if (upsResults.some(Boolean)) {
        trackingTargetPlanIds.forEach((planId) => patchTracking(planId, { ups: normalizedUps }));
      }
      // Success — clear selection to close the tracking card
      clearSelection();
      window.dispatchEvent(new CustomEvent(FBA_SCAN_STATUS, { detail: 'Tracking saved' }));
      window.dispatchEvent(new CustomEvent(FBA_ACTIVE_SHIPMENTS_REFRESH));
      refreshDomain('orders.outbound');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save tracking');
    } finally {
      setSaving(false);
    }
  }, [
    activeTracking.amazon,
    activeTracking.ups,
    amazonOk,
    upsOk,
    patchTracking,
    trackingTargetPlanIds,
  ]);

  const selectedCount = selectedItems.length;
  const shouldShowTrackingCard = showTrackingCard && scanEnabled && selectedCount > 0;

  return (
    <div className={shouldShowTrackingCard ? 'min-h-0 space-y-2' : 'min-h-0'}>
      {scanEnabled ? (
        <div className="min-w-0">
          <StationFbaInput
            fbaScanOnly
            showLabels={false}
            ignoreUrlPlan
            scanMode={scanMode}
            sidebarHeaderBand={sidebarHeaderBand}
            workspaceTheme={stationTheme}
            techStaffIdOverride={effectiveStaffId ?? undefined}
          />
        </div>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {shouldShowTrackingCard ? (
          <motion.div
            key={`fba-tracking-${selectedPlanIds.join('-') || 'empty'}`}
            layout={false}
            variants={TRACKING_PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={trackingTransition}
            className={scanChrome.trackingCard}
          >
            {saving ? (
              <div className="flex items-center justify-end gap-2">
                <Loader2 className={`h-4 w-4 shrink-0 animate-spin ${scanChrome.savingSpinner}`} aria-hidden />
              </div>
            ) : null}

            <div className="space-y-3">
              {trackingTargetPlanIds.length > 1 ? (
                <div className="border border-border-accent bg-surface-accent px-3 py-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-accent" />
                    <div>
                      <p className="text-role-micro uppercase tracking-[0.16em] text-text-default">Apply to selected plans</p>
                      <p className="mt-1 text-role-caption leading-5 text-text-default">
                        Changes here will apply to all {trackingTargetPlanIds.length} selected plans.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <TextField
                label="Amazon FBA shipment ID"
                value={activeTracking.amazon}
                onChange={(value) => setActiveTracking({ amazon: value })}
                disabled={saving || trackingTargetPlanIds.length === 0}
                mono
                inputClassName={activeTracking.amazon && !amazonOk ? 'border-border-warning' : ''}
              />
              <TextField
                label="UPS shipping label / tracking"
                value={activeTracking.ups}
                onChange={(value) => setActiveTracking({ ups: value })}
                disabled={saving || trackingTargetPlanIds.length === 0}
                mono
                inputClassName={activeTracking.ups && !upsOk ? 'border-border-warning' : ''}
              />

              <Button
                variant={trackingReady && !saving ? 'success' : 'secondary'}
                type="button"
                onClick={() => void onSaveTracking()}
                disabled={saving || !trackingReady}
                radius="flush"
                className="h-auto w-full px-3 py-2.5 text-role-caption font-semibold uppercase tracking-[0.12em]"
              >
                {trackingReady ? 'Save tracking' : 'Enter valid FBA ID and UPS to save'}
              </Button>
            </div>

            {saveError && (
              <p className="border border-border-danger bg-surface-danger px-2.5 py-2 text-role-caption font-semibold text-text-danger">
                {saveError}
              </p>
            )}

            {/* Selection summary + clear */}
            <div className={`${scanChrome.trackingSectionBorder} flex items-center justify-between gap-2 pt-3`}>
              <span className="text-role-micro uppercase tracking-[0.14em] text-text-soft">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="secondary"
                type="button"
                onClick={() => clearSelection()}
                radius="flush"
                className="h-auto border border-border-soft px-2.5 py-1 text-role-eyebrow uppercase tracking-[0.14em] text-text-soft hover:bg-surface-hover hover:text-text-default"
              >
                Clear
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
