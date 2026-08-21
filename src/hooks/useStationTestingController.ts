'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { classifyInput } from '@/lib/scan-resolver';
import { detectStationScanType, type StationInputMode, type StationScanType } from '@/lib/station-scan-routing';
import { stationThemeColors, type StationTheme } from '@/utils/staff-colors';
import type { ActiveStationOrder, ResolvedProductManual, ScanHandlerContext } from './station/types';
import { handleTrackingScan } from './station/handleTrackingScan';
import { handleFnskuScan } from './station/handleFnskuScan';
import { handleSkuScan } from './station/handleSkuScan';
import { handleSerialScan } from './station/handleSerialScan';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { handleRepairScan } from './station/handleRepairScan';
import { handleCommand } from './station/handleCommand';
import { normalizeTrackingKey } from '@/lib/tracking-format';
import { rebuildSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import {
  looksLikePackStationBarcode,
  readArmedPackStation,
  writeArmedPackStation,
} from '@/lib/packing/pack-station-arm';
import { looksLikeUnitId } from '@/lib/testing/resolve-testing-scan';
import { TECH_CLOSE_ACTIVE_ORDER_EVENT } from '@/components/tech/tech-active-order-events';

// Re-export types consumed by external components — import paths unchanged.
export type { StationInputMode, StationScanType };
export type { ActiveStationOrder, ResolvedProductManual };
/** @deprecated Use StationTheme from '@/utils/staff-colors' instead. */
export type StationThemeColor = StationTheme;

type ForcedStationScanType = 'TRACKING' | 'SERIAL' | 'FNSKU' | 'REPAIR';

const LAST_MANUAL_STORAGE_PREFIX = 'cf:last-manual:tech:';

function newStationIdempotencyKey(): string {
  return safeRandomUUID();
}

/**
 * When an order is still short on serials, barcodes that look like "generic" tracking
 * (carrier: unknown — e.g. 10+ chars ending in a digit, or 20+ chars) are usually
 * product serials. Known carrier prefixes (1Z, 9[2-5]…, JD, TBA, etc.) still route
 * as TRACKING so a new label can be scanned without arming tracking mode.
 */
function resolveScanType(val: string, contextOrder: ActiveStationOrder | null): StationScanType {
  const base = detectStationScanType(val);
  if (!contextOrder) return base;

  const qty = Math.max(1, Number(contextOrder.quantity) || 1);
  const incomplete = contextOrder.serialNumbers.length < qty;
  if (!incomplete || base !== 'TRACKING') return base;

  const { carrier } = classifyInput(val);
  if (carrier) return 'TRACKING';

  return 'SERIAL';
}

export function getOrderIdLast8(orderId: string) {
  const digits = String(orderId || '').replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return String(orderId || '').slice(-8);
}

export function useStationTestingController({
  userId,
  userName,
  onComplete,
  themeColor,
  onTrackingScan,
  onTrackingOrderLoaded,
  onFnskuOrderLoaded,
  onUnitLabelScanned,
}: {
  userId: string;
  userName: string;
  onComplete?: () => void;
  themeColor: StationThemeColor;
  onTrackingScan?: () => void;
  onTrackingOrderLoaded?: () => void;
  onFnskuOrderLoaded?: () => void;
  /** Fired with the RAW scanned value after a serial scan resolves — the host
   *  gates it to genuine unit labels and fires the packer photo request. */
  onUnitLabelScanned?: (rawInput: string) => void;
}) {
  const queryClient = useQueryClient();

  // Keep callback refs so handlers always call the latest prop without re-creating ctx.
  const onFnskuOrderLoadedRef = useRef(onFnskuOrderLoaded);
  const onUnitLabelScannedRef = useRef(onUnitLabelScanned);
  useEffect(() => { onFnskuOrderLoadedRef.current = onFnskuOrderLoaded; }, [onFnskuOrderLoaded]);
  useEffect(() => { onUnitLabelScannedRef.current = onUnitLabelScanned; }, [onUnitLabelScanned]);

  // ── core state ────────────────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveStationOrder | null>(null);
  const lastScannedOrderRef = useRef<ActiveStationOrder | null>(null);
  const scanSessionIdRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [trackingNotFoundAlert, setTrackingNotFoundAlert] = useState<string | null>(null);
  const [resolvedManuals, setResolvedManuals] = useState<ResolvedProductManual[]>([]);
  const [isManualLoading, setIsManualLoading] = useState(false);
  const manualRequestIdRef = useRef(0);

  const activeColor = stationThemeColors[themeColor];

  const syncActiveOrderState = (nextOrder: ActiveStationOrder | null) => {
    setActiveOrder(nextOrder);
    if (!nextOrder) {
      lastScannedOrderRef.current = null;
      scanSessionIdRef.current = null;
      return;
    }
    lastScannedOrderRef.current = nextOrder;
    // Always sync the session ref so an FNSKU scan that explicitly clears
    // scanSessionId doesn't leave a stale tracking session.
    if (nextOrder.scanSessionId !== undefined) {
      scanSessionIdRef.current = nextOrder.scanSessionId ?? null;
    }
  };

  const getScanContextOrder = () => activeOrder ?? lastScannedOrderRef.current;
  const reopenScanContextOrder = () => {
    const contextOrder = getScanContextOrder();
    if (!contextOrder) return null;
    syncActiveOrderState(contextOrder);
    return contextOrder;
  };

  // ── manual management ─────────────────────────────────────────────────────────
  const publishLastManual = (manuals: ResolvedProductManual[]) => {
    if (typeof window === 'undefined') return;
    const storageKey = `${LAST_MANUAL_STORAGE_PREFIX}${userId}`;
    if (manuals.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(manuals));
    } else {
      window.localStorage.removeItem(storageKey);
    }
    window.dispatchEvent(new CustomEvent('tech-last-manual-updated', {
      detail: { techId: userId, manuals },
    }));
  };

  const clearManuals = () => {
    setResolvedManuals([]);
    publishLastManual([]);
  };

  const resolveManual = async (_sku?: string | null, itemNumber?: string | null) => {
    const requestId = ++manualRequestIdRef.current;
    const itemNumberValue = String(itemNumber || '').trim();
    if (!itemNumberValue) {
      clearManuals();
      return;
    }
    setIsManualLoading(true);
    try {
      const params = new URLSearchParams();
      if (itemNumberValue) params.set('itemNumber', itemNumberValue);
      const res = await fetch(`/api/manuals/resolve?${params.toString()}`);
      const data = await res.json();
      if (requestId !== manualRequestIdRef.current) return;
      if (res.ok && data?.found && Array.isArray(data?.manuals) && data.manuals.length > 0) {
        const manuals = data.manuals as ResolvedProductManual[];
        setResolvedManuals(manuals);
        publishLastManual(manuals);
      } else {
        clearManuals();
      }
    } catch (error) {
      console.error('Manual resolve failed:', error);
      if (requestId !== manualRequestIdRef.current) return;
      clearManuals();
    } finally {
      if (requestId !== manualRequestIdRef.current) return;
      setIsManualLoading(false);
    }
  };

  // ── misc helpers ──────────────────────────────────────────────────────────────
  const triggerGlobalRefresh = () => {
    if (onComplete) onComplete();
    refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
  };

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setTrackingNotFoundAlert(null);
  };

  // ── effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (errorMessage || successMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
        setSuccessMessage(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [errorMessage, successMessage]);

  useEffect(() => {
    if (!trackingNotFoundAlert) return;
    const timer = setTimeout(() => setTrackingNotFoundAlert(null), 2500);
    return () => clearTimeout(timer);
  }, [trackingNotFoundAlert]);

  useEffect(() => {
    if (!activeOrder) {
      manualRequestIdRef.current += 1;
      setResolvedManuals([]);
      setIsManualLoading(false);
      publishLastManual([]);
    }
  }, [activeOrder]);

  // ── right-pane bridge ─────────────────────────────────────────────────────────
  // Publish active-order state so TechDashboard's right pane can swap from the
  // global history table into a focused workspace. Listeners consume this via
  // `tech-active-order-changed` — payload is null when nothing is active.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = activeOrder
      ? { activeOrder, manuals: resolvedManuals, isManualLoading }
      : null;
    window.dispatchEvent(new CustomEvent('tech-active-order-changed', { detail: payload }));
  }, [activeOrder, resolvedManuals, isManualLoading]);

  // Identity ◁ / Back to list — stand the controller down so a later manuals
  // resolve cannot republish the order and reopen the overlay.
  useEffect(() => {
    const close = () => syncActiveOrderState(null);
    window.addEventListener(TECH_CLOSE_ACTIVE_ORDER_EVENT, close);
    return () => window.removeEventListener(TECH_CLOSE_ACTIVE_ORDER_EVENT, close);
  }, []);

  useEffect(() => {
    const handleUndoApplied = (e: any) => {
      const detailSal = e?.detail?.salId != null ? Number(e.detail.salId) : NaN;
      const activeSal = activeOrder?.salId != null ? Number(activeOrder.salId) : NaN;
      const salMatch =
        Number.isFinite(detailSal) &&
        detailSal > 0 &&
        Number.isFinite(activeSal) &&
        activeSal > 0 &&
        detailSal === activeSal;

      const eventKey = normalizeTrackingKey(String(e?.detail?.tracking || ''));
      const activeKey = normalizeTrackingKey(String(activeOrder?.tracking || ''));
      const trackingMatch =
        eventKey.length > 0 && activeKey.length > 0 && eventKey === activeKey;

      const serialNumbers = Array.isArray(e?.detail?.serialNumbers) ? e.detail.serialNumbers : [];
      const removedSerial = e?.detail?.removedSerial;
      if (!activeOrder) return;
      if (!salMatch && !trackingMatch) return;
      syncActiveOrderState({
        ...activeOrder,
        serialNumbers,
        skuSerialGroups: rebuildSkuSerialGroups(
          activeOrder.skuSerialGroups,
          serialNumbers,
          activeOrder.sku,
        ),
      });
      if (removedSerial) {
        setSuccessMessage(`Undo successful: removed ${removedSerial}`);
      } else {
        setSuccessMessage('Undo successful');
      }
    };
    window.addEventListener('tech-undo-applied' as any, handleUndoApplied as any);
    return () => window.removeEventListener('tech-undo-applied' as any, handleUndoApplied as any);
  }, [activeOrder]);

  useEffect(() => {
    const handleTechLogRemoved = (e: any) => {
      if (!activeOrder) return;
      const { tracking, fnsku } = e?.detail ?? {};
      const activeTracking = String(activeOrder.tracking || '').trim().toUpperCase();
      const activeFnsku = String(activeOrder.fnsku || '').trim().toUpperCase();
      const eventTracking = String(tracking || '').trim().toUpperCase();
      const eventFnsku = String(fnsku || '').trim().toUpperCase();
      const matchesByTracking = eventTracking && activeTracking === eventTracking;
      const matchesByFnsku =
        activeFnsku && eventFnsku && (activeFnsku === eventFnsku || activeTracking === eventFnsku);
      if (!matchesByTracking && !matchesByFnsku) return;
      syncActiveOrderState(null);
    };
    window.addEventListener('tech-log-removed' as any, handleTechLogRemoved as any);
    return () => window.removeEventListener('tech-log-removed' as any, handleTechLogRemoved as any);
  }, [activeOrder]);

  // ── shared context assembled for handlers ─────────────────────────────────────
  const buildCtx = (): ScanHandlerContext => ({
    userId,
    userName,
    getScanContextOrder,
    reopenScanContextOrder,
    syncActiveOrderState,
    setIsLoading,
    setErrorMessage,
    setSuccessMessage,
    setInputValue,
    inputRef,
    scanSessionIdRef,
    queryClient,
    triggerGlobalRefresh,
    resolveManual,
    clearManuals,
    newIdempotencyKey: newStationIdempotencyKey,
    onUnitLabelScanned: (raw: string) => onUnitLabelScannedRef.current?.(raw),
    getArmedPackLocationId: () => readArmedPackStation()?.locationId ?? null,
  });

  // ── main submit router ────────────────────────────────────────────────────────
  const handleSubmit = async (
    e?: React.FormEvent,
    manualValue?: string,
    options?: { forcedType?: ForcedStationScanType | null },
  ) => {
    if (e) e.preventDefault();
    const input = (manualValue || inputValue).trim();
    if (!input) return;

    clearFeedback();

    // Packing-station barcode arms the Ready-to-Pack place target (batch sort).
    if (!options?.forcedType && looksLikePackStationBarcode(input)) {
      setIsLoading(true);
      try {
        const res = await fetch('/api/orders/pack-placement');
        const data = await res.json().catch(() => null);
        const match = Array.isArray(data?.locations)
          ? data.locations.find(
              (loc: { barcode?: string | null; id: number; name: string; locationKind: string }) =>
                String(loc.barcode || '').toUpperCase() === input.toUpperCase(),
            )
          : null;
        if (!match) {
          setErrorMessage(`Unknown packing station barcode: ${input}`);
          return;
        }
        writeArmedPackStation({
          locationId: Number(match.id),
          name: String(match.name),
          barcode: match.barcode ?? null,
          locationKind: match.locationKind === 'STAGING' ? 'STAGING' : 'DESK',
        });
        window.dispatchEvent(new CustomEvent('cf-pack-station-armed'));
        setSuccessMessage(`Armed: ${match.name}`);
        setInputValue('');
        void queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] });
      } catch {
        setErrorMessage('Could not arm packing station');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Ready-to-Pack loose-unit staging (Phase 2): a printed unit-id sticker
    // ({SKU}-{YYWW}-{SEQ6}) scanned while a packing bench is armed places that
    // loose unit on the bench. Raw manufacturer serials are NOT unit-id-shaped,
    // so they still attach to the active order — the Phase 1 order flow is
    // unchanged, and this only diverts when a bench is actually armed.
    if (!options?.forcedType && looksLikeUnitId(input)) {
      const armedUnitBench = readArmedPackStation();
      if (armedUnitBench) {
        setIsLoading(true);
        try {
          const res = await fetch('/api/units/pack-placement/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              unitScan: input,
              locationId: armedUnitBench.locationId,
              idempotencyKey: newStationIdempotencyKey(),
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.success) {
            setErrorMessage(data?.error || 'Could not place unit on the bench');
            return;
          }
          setSuccessMessage(`Placed unit at ${data.placement.locationName}`);
          setInputValue('');
          void queryClient.invalidateQueries({ queryKey: ['units', 'pack-placement'] });
        } catch {
          setErrorMessage('Could not place unit on the bench');
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    const contextOrder = getScanContextOrder();
    const forcedType = options?.forcedType;
    const type: StationScanType =
      forcedType === 'TRACKING' || forcedType === 'SERIAL' || forcedType === 'FNSKU' || forcedType === 'REPAIR'
        ? forcedType
        : resolveScanType(input, contextOrder);

    const ctx = buildCtx();

    switch (type) {
      case 'TRACKING': return handleTrackingScan(input, ctx, { onTrackingScan, onTrackingOrderLoaded });
      case 'FNSKU':    return handleFnskuScan(input, ctx, { onFnskuOrderLoaded: onFnskuOrderLoadedRef.current });
      case 'SKU':      return handleSkuScan(input, ctx);
      case 'SERIAL':   return handleSerialScan(input, ctx);
      case 'REPAIR':   return handleRepairScan(input, ctx);
      case 'COMMAND':  return handleCommand(input, ctx, { onComplete });
    }
  };

  return {
    inputValue,
    setInputValue,
    isLoading,
    inputRef,
    activeOrder,
    setActiveOrder: syncActiveOrderState,
    errorMessage,
    successMessage,
    trackingNotFoundAlert,
    resolvedManuals,
    isManualLoading,
    activeColor,
    handleSubmit,
    triggerGlobalRefresh,
    clearFeedback,
  };
}
