'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle } from '@/components/Icons';
import { ShippingRecentRail } from '@/components/sidebar/shipping/ShippingRecentRail';
import { ShippingScanBar } from '@/components/sidebar/tech/ShippingScanBar';
import { ScanBandShell } from '@/components/station/scan-bar';
import { ActiveOrderScanFeedback } from './ActiveOrderScanFeedback';
import { type StationInputMode, useStationTestingController } from '@/hooks/useStationTestingController';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useIsMobile } from '@/hooks';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { useUnitPhotoRequestPublisher } from '@/components/sidebar/receiving/useUnitPhotoRequestPublisher';
import { UnitPhotoRequestStatus } from '@/components/station/UnitPhotoRequestStatus';
import { scannedUnitKey } from '@/lib/barcode-routing';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';

interface StationTestingProps {
  userId: string;
  userName: string;
  staffId: number | string;
  onTrackingScan?: () => void;
  onComplete?: () => void;
  embedded?: boolean;
}

export default function StationTesting({
  userId,
  userName,
  staffId,
  onTrackingScan,
  onComplete,
  embedded = false,
}: StationTestingProps) {
  const { theme: themeColor } = useStationTheme({ staffId });
  const [manualMode, setManualMode] = useState<StationInputMode | null>(null);
  const isMobile = useIsMobile();

  // ── Packer testing-label photo scan (flag-gated, ships dark) ──────────────
  // On a genuine printed unit-label scan, resolve the label key → serial_units.id
  // and fire a `unit_photo_request` to the paired phone (implicit staffstation
  // pairing). Uses the signed-in user's own org+staff so the Ably capability
  // matches. See docs/todo/packer-testing-photo-scan-timeline-plan.md.
  const { user } = useAuth();
  const authOrgId = user?.organizationId;
  const authStaffId = user?.staffId ?? 0;
  const { getClient: getAblyClient } = useAblyClient();
  const unitPhotoChannelName = safeChannelName(() =>
    getStaffStationBridgeChannelName(authOrgId!, authStaffId),
  );
  const publishUnitPhotoRequest = useUnitPhotoRequestPublisher({
    staffIdNum: authStaffId,
    getAblyClient,
    stationChannelName: unitPhotoChannelName,
  });
  // The unit whose phone photo request most recently fired — drives the ambient
  // "Photo request sent → phone · N captured" status under the active card.
  const [lastUnitPhotoRequest, setLastUnitPhotoRequest] = useState<
    { serialUnitId: number; unitKey: string | null } | null
  >(null);
  const handleUnitLabelScanned = useCallback(
    (rawInput: string) => {
      const key = scannedUnitKey(rawInput);
      if (!key) return;
      // Resolve the label key → canonical serial_units.id, then request phone
      // photos. Degrade-not-block: a 404 / missing id (no unit row) fires no
      // request and leaves the scan loop untouched.
      void (async () => {
        try {
          const res = await fetch(`/api/serial-units/${encodeURIComponent(key)}/photos`);
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          const serialUnitId = Number(data?.unit_id);
          if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) return;
          await publishUnitPhotoRequest({ serialUnitId, unitKey: key });
          setLastUnitPhotoRequest({ serialUnitId, unitKey: key });
        } catch (err) {
          console.warn('station-testing: unit photo request failed', err);
        }
      })();
    },
    [publishUnitPhotoRequest],
  );

  const {
    inputValue,
    setInputValue,
    isLoading,
    inputRef,
    activeOrder,
    setActiveOrder,
    handleSubmit,
    triggerGlobalRefresh,
    clearFeedback,
    reopenLastActiveOrderCard,
    errorMessage,
  } = useStationTestingController({
    userId,
    userName,
    onComplete,
    themeColor,
    onTrackingScan,
    onTrackingOrderLoaded: useCallback(() => {
      setManualMode((m) => (m === 'tracking' ? null : m));
    }, []),
    onActiveOrderCardAutoHidden: useCallback(() => {
      setManualMode('tracking');
    }, []),
    onFnskuOrderLoaded: useCallback(() => {
      setManualMode((m) => (m === 'fba' ? null : m));
    }, []),
    onUnitLabelScanned: handleUnitLabelScanned,
  });

  // Clear the ambient unit photo-request status when the active order clears.
  useEffect(() => {
    if (!activeOrder) setLastUnitPhotoRequest(null);
  }, [activeOrder]);

  const forcedTypeForManualMode = useCallback((mode: StationInputMode | null) => {
    if (mode === 'tracking') return 'TRACKING' as const;
    if (mode === 'serial') return 'SERIAL' as const;
    if (mode === 'fba') return 'FNSKU' as const;
    if (mode === 'repair') return 'REPAIR' as const;
    return undefined;
  }, []);

  const handleFormSubmit = useCallback(
    (e?: React.FormEvent, overrideTracking?: string) => {
      e?.preventDefault();

      const value = overrideTracking ?? inputValue;
      const trimmedValue = value.trim();
      if (!trimmedValue && typeof overrideTracking !== 'string') {
        return;
      }

      const fromUpNextTracking = typeof overrideTracking === 'string';
      const manualForcedType = fromUpNextTracking
        ? 'TRACKING'
        : forcedTypeForManualMode(manualMode);

      // One-shot: after arming a mode with the buttons, the next non-empty submit uses it then returns to auto.
      const hadManualOverride = manualMode !== null && !fromUpNextTracking;
      if (trimmedValue && hadManualOverride && manualForcedType) {
        setManualMode(null);
      }

      const isFnskuInput = Boolean(trimmedValue) && looksLikeFnsku(trimmedValue);

      // In auto mode, FNSKU-looking input routes to the dedicated FBA endpoint.
      // Manual mode now fully overrides auto classification.
      // Route through handleSubmit so the hook's handleFnskuScan runs and calls
      // syncActiveOrderState — this updates lastScannedOrderRef so serials always
      // anchor to the latest FNSKU_SCANNED SAL entry.
      if (isFnskuInput && !fromUpNextTracking && !manualForcedType) {
        handleSubmit(undefined, value, { forcedType: 'FNSKU' });
        return;
      }

      if (manualForcedType === 'FNSKU') {
        handleSubmit(undefined, value, { forcedType: 'FNSKU' });
        return;
      }

      handleSubmit(undefined, overrideTracking, manualForcedType ? { forcedType: manualForcedType } : undefined);
    },
    [inputValue, manualMode, forcedTypeForManualMode, handleSubmit, setManualMode]
  );

  const toggleMode = useCallback(
    (nextMode: StationInputMode) => {
      const togglingOff = manualMode === nextMode;
      const nextManualMode = togglingOff ? null : nextMode;
      setManualMode(nextManualMode);

      if (nextManualMode === 'serial') {
        reopenLastActiveOrderCard();
      }

      const pendingInput = inputValue.trim();
      if (togglingOff || !pendingInput) {
        queueMicrotask(() => inputRef.current?.focus());
        return;
      }

      const forced = forcedTypeForManualMode(nextManualMode);
      if (!forced) {
        queueMicrotask(() => inputRef.current?.focus());
        return;
      }

      const raw = inputValue;
      setManualMode(null);
      if (forced === 'FNSKU') {
        handleSubmit(undefined, raw, { forcedType: 'FNSKU' });
        return;
      }

      handleSubmit(undefined, raw, { forcedType: forced });
    },
    [
      manualMode,
      inputValue,
      inputRef,
      forcedTypeForManualMode,
      handleSubmit,
      reopenLastActiveOrderCard,
      setManualMode,
    ],
  );

  const failPresence = useMotionPresence(framerPresence.stationCard);
  const failTransition = useMotionTransition(framerTransition.stationCardMount);

  /* ── Flush 40px scan band (same ScanBandShell as Unbox / Shipping). ── */
  const scanBar = (
    <ShippingScanBar
      value={inputValue}
      onChange={setInputValue}
      onSubmit={handleFormSubmit}
      inputRef={inputRef}
      staffId={staffId}
      isResolving={isLoading}
      armedMode={manualMode}
      onToggleMode={toggleMode}
      idleFallbackMode={activeOrder ? 'serial' : 'tracking'}
    />
  );

  const feedbackBelow = (
    <div className={SIDEBAR_GUTTER}>
      <AnimatePresence mode="wait">
        {errorMessage && !activeOrder ? (
          <motion.div
            key="station-fail"
            initial={failPresence.initial}
            animate={failPresence.animate}
            exit={failPresence.exit}
            transition={failTransition}
            role="alert"
            className="mb-2 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-800 shadow-sm"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="text-role-caption font-semibold">{errorMessage}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ActiveOrderScanFeedback activeOrder={activeOrder} />
      {lastUnitPhotoRequest ? (
        <UnitPhotoRequestStatus
          serialUnitId={lastUnitPhotoRequest.serialUnitId}
          unitKey={lastUnitPhotoRequest.unitKey}
        />
      ) : null}
    </div>
  );

  return (
    <div className={`flex flex-col h-full bg-surface-card overflow-hidden ${embedded ? '' : 'border-r border-border-hairline'}`}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {!isMobile && (
          <div className="shrink-0 min-w-0">
            <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
            {feedbackBelow}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ShippingRecentRail
            techId={userId}
            onStart={(tracking) => {
              setActiveOrder(null);
              clearFeedback();
              setTimeout(() => handleFormSubmit(undefined, tracking), 50);
            }}
            onMissingParts={() => {
              triggerGlobalRefresh();
            }}
            onAllCompleted={onComplete}
          />
        </div>

        {isMobile && (
          <div className="flex-shrink-0 border-t border-border-hairline bg-surface-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {feedbackBelow}
            <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
          </div>
        )}
      </div>
    </div>
  );
}
