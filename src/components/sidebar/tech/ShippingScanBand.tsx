'use client';

import { useState, useCallback, useEffect } from 'react';
import { ActiveOrderScanFeedback } from '@/components/station/ActiveOrderScanFeedback';
import {
  type StationInputMode,
  useStationTestingController,
} from '@/hooks/useStationTestingController';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { useStationTheme } from '@/hooks/useStationTheme';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
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
        <div className={SIDEBAR_GUTTER}>
          <ActiveOrderScanFeedback activeOrder={activeOrder} />
        </div>
        <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
      </div>
    );
  }

  return (
    <div className="shrink-0 min-w-0">
      <ScanBandShell themeColor={themeColor}>{scanBar}</ScanBandShell>
      <div className={SIDEBAR_GUTTER}>
        <ActiveOrderScanFeedback activeOrder={activeOrder} />
      </div>
    </div>
  );
}
