'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type StationInputMode,
  useStationTestingController,
} from '@/hooks/useStationTestingController';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { useStationTheme } from '@/hooks/useStationTheme';
import { ScanBandShell, isScanPreview, useScanModeRelease } from '@/components/station/scan-bar';
import { ShippingScanBar } from '@/components/sidebar/tech/ShippingScanBar';
import { useArmedPackStation } from '@/hooks/useArmedPackStation';
import { unitPackPlacementQuery } from '@/lib/queries/unit-pack-placement-queries';
import { IconButton } from '@/design-system/primitives/IconButton';
import { X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface ShippingScanBandProps {
  userId: string;
  userName: string;
  staffId: number | string;
  onComplete?: () => void;
  /** When true, renders only the scan bar block (mobile footer). */
  scanOnly?: boolean;
  /** Receives a handler that loads an Up Next order by tracking (Start action). */
  onStartHandlerReady?: (startWithTracking: (tracking: string) => void) => void;
}

/**
 * Shipping-mode scan band — order / FNSKU / repair / serial input. Used by
 * {@link ShippingSidebarPanel} and the legacy {@link StationTesting} embed.
 * Flush 40px {@link ScanBandShell} — same geometry as Unbox / Testing (no py).
 *
 * **The scan column carries the BAR and nothing else** (2026-08-02). It used to
 * render an active-order confirmation card under the bar as well, so a scanned
 * order was drawn twice — here, and in the middle as
 * `ShippingEntityContextHeader`. Two renders of one entity are two things that
 * can disagree, on the surface whose only job is telling an operator what is in
 * their hands. That card moved to `ActiveOrderWorkspace`, and in 2026-08-18 it
 * was deleted there too: the identity row already says what is in hand, and its
 * one real verb (undo a serial) lives on Displays → Units. `ReceivingSidebarPanel`
 * carries no identity at all — same shape.
 *
 * This component still OWNS the controller — it is the only
 * `useStationTestingController` instance in the app, and the middle receives its
 * active order through `tech-active-order-changed` (`useTechOrderPanes`). Moving
 * the controller out is a separate job; moving the DISPLAY out is this one.
 */
export function ShippingScanBand({
  userId,
  userName,
  staffId,
  onComplete,
  scanOnly = false,
  onStartHandlerReady,
}: ShippingScanBandProps) {
  const { theme: themeColor } = useStationTheme({ staffId });
  const [manualMode, setManualMode] = useState<StationInputMode | null>(null);
  const releaseManualMode = useCallback(() => setManualMode(null), []);
  useScanModeRelease(manualMode != null, releaseManualMode);
  const { armed, clear: clearArmedStation } = useArmedPackStation();
  // Live count of loose units staged at the armed bench (Phase 2 unit placement).
  const unitPlacement = useQuery(unitPackPlacementQuery());
  const armedUnitCount = armed
    ? (unitPlacement.data?.counts ?? []).find((c) => c.locationId === armed.locationId)?.count ?? 0
    : 0;

  const {
    inputValue,
    setInputValue,
    isLoading,
    inputRef,
    activeOrder,
    setActiveOrder,
    handleSubmit,
    clearFeedback,
  } = useStationTestingController({
    userId,
    userName,
    onComplete,
    themeColor,
    onTrackingOrderLoaded: useCallback(() => {
      setManualMode((m) => (m === 'tracking' ? null : m));
    }, []),
    onFnskuOrderLoaded: useCallback(() => {
      setManualMode((m) => (m === 'fba' ? null : m));
    }, []),
  });

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
      if (isScanPreview() && typeof overrideTracking !== 'string') return;
      const value = overrideTracking ?? inputValue;
      const trimmedValue = value.trim();
      if (!trimmedValue && typeof overrideTracking !== 'string') return;

      const fromUpNextTracking = typeof overrideTracking === 'string';
      const manualForcedType = fromUpNextTracking
        ? 'TRACKING'
        : forcedTypeForManualMode(manualMode);

      const hadManualOverride = manualMode !== null && !fromUpNextTracking;
      if (trimmedValue && hadManualOverride && manualForcedType) {
        setManualMode(null);
      }

      const isFnskuInput = Boolean(trimmedValue) && looksLikeFnsku(trimmedValue);
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
    [inputValue, manualMode, forcedTypeForManualMode, handleSubmit],
  );

  useEffect(() => {
    if (!onStartHandlerReady) return;
    onStartHandlerReady((tracking) => {
      setActiveOrder(null);
      clearFeedback();
      setTimeout(() => handleFormSubmit(undefined, tracking), 50);
    });
  }, [onStartHandlerReady, setActiveOrder, clearFeedback, handleFormSubmit]);

  const toggleMode = useCallback(
    (nextMode: StationInputMode) => {
      const togglingOff = manualMode === nextMode;
      const nextManualMode = togglingOff ? null : nextMode;
      setManualMode(nextManualMode);
      const pendingInput = inputValue.trim();
      if (togglingOff || !pendingInput || isScanPreview()) {
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
    [manualMode, inputValue, inputRef, forcedTypeForManualMode, handleSubmit],
  );

  const idleFallbackMode: StationInputMode = activeOrder ? 'serial' : 'tracking';

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
      idleFallbackMode={idleFallbackMode}
    />
  );

  // Armed chip only — no empty-state "scan a station to place" prompt (KPI / barcode
  // arming stays available; the banner was noise on the Ready-to-Pack left rail).
  const armedChip = armed ? (
    <div className="flex items-center gap-1 border-b border-border-soft bg-surface-sunken px-2 py-1">
      <span className="min-w-0 flex-1 truncate text-role-micro font-semibold text-text-soft">
        Placing at {armed.name}
        <span className="ml-1 text-text-faint" data-testid="armed-unit-count">
          · {armedUnitCount} unit{armedUnitCount === 1 ? '' : 's'} staged
        </span>
      </span>
      <HoverTooltip label="Clear armed packing station">
        <IconButton
          type="button"
          size="sm"
          tone="neutral"
          ariaLabel="Clear armed packing station"
          onClick={() => clearArmedStation()}
          icon={<X className="h-3.5 w-3.5" />}
        />
      </HoverTooltip>
    </div>
  ) : null;

  if (scanOnly) {
    return (
      <div className="min-w-0 shrink-0">
        {armedChip}
        <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
      </div>
    );
  }

  return (
    <div className="shrink-0 min-w-0">
      {armedChip}
      <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
    </div>
  );
}
