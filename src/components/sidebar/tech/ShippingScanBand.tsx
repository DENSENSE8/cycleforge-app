'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  type StationInputMode,
  useStationTestingController,
} from '@/hooks/useStationTestingController';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { useStationTheme } from '@/hooks/useStationTheme';
import { ScanBandShell } from '@/components/station/scan-bar';
import { ShippingScanBar } from '@/components/sidebar/tech/ShippingScanBar';

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
 * render `ActiveOrderScanFeedback` under the bar as well, so a scanned order was
 * drawn twice — here, and in the middle as `ShippingEntityContextHeader` + the
 * Ship tab. Two renders of one entity are two things that can disagree, on the
 * surface whose only job is telling an operator what is in their hands. The card
 * moved to `ActiveOrderWorkspace` (the Station focus surface), which is Unbox's
 * shape: `ReceivingSidebarPanel` carries no identity at all.
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

  const {
    inputValue,
    setInputValue,
    isLoading,
    inputRef,
    activeOrder,
    setActiveOrder,
    handleSubmit,
    clearFeedback,
    reopenLastActiveOrderCard,
  } = useStationTestingController({
    userId,
    userName,
    onComplete,
    themeColor,
    onTrackingOrderLoaded: useCallback(() => {
      setManualMode((m) => (m === 'tracking' ? null : m));
    }, []),
    onActiveOrderCardAutoHidden: useCallback(() => {
      setManualMode('tracking');
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
      if (nextManualMode === 'serial') reopenLastActiveOrderCard();
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
    [manualMode, inputValue, inputRef, forcedTypeForManualMode, handleSubmit, reopenLastActiveOrderCard],
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

  if (scanOnly) {
    return (
      <div className="min-w-0 shrink-0">
        <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
      </div>
    );
  }

  return (
    <div className="shrink-0 min-w-0">
      <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
    </div>
  );
}
