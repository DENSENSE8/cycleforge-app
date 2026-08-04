'use client';

/**
 * Right-pane order state for the packer dashboard: a scanned/selected order
 * overlays the Queue · History browse workbench (Unbox pattern).
 */

import { useEffect, useState } from 'react';

/**
 * How long a scanned/active order stays on the packer right pane before it
 * auto-crossfades back to the history table. Mirrors the Station act-and-clear
 * auto-hide (`COMPLETED_ORDER_AUTO_HIDE_MS` in `useStationTestingController`);
 * the crossfade itself stays fast (`framerTransition.stationCardMount`, 0.26s)
 * — this is the *dwell*, not the animation length (see
 * `.claude/rules/display/station.md` §5 and `motion-crossfade.md`).
 */
const ACTIVE_ORDER_AUTO_HIDE_MS = 2 * 60 * 1000;

export interface PackActiveOrderPane {
  orderRowId: number | null;
  orderId: string;
  productTitle: string;
  qty: number;
  condition: string;
  tracking: string;
  sku?: string;
  scanType?: 'ORDERS' | 'SKU' | 'REPAIR' | 'UNIT';
  /** Prepack unit resolved from unit-label QR at the pack station. */
  serialUnitId?: number | null;
  unitKey?: string | null;
  packerLogId?: number | null;
  /** True when the sidebar scan opened the overlay (affects remount key). */
  scanDriven?: boolean;
  /**
   * Pack scan missed the orders table (exception Path B) — show Unfound-style
   * chrome and the "Unknown order" accordion empty row.
   */
  isUnknownOrder?: boolean;
}

/**
 * An FBA scan is the OTHER active entity this bench resolves — a shipment /
 * FNSKU, not an order — so it gets its own pane rather than being flattened
 * into `PackActiveOrderPane`. Shape mirrors what `/api/fba/items/scan` and the
 * ship-on-scan path already return.
 */
export interface PackActiveFbaPane {
  fnsku: string;
  productTitle: string;
  shipmentRef: string | null;
  plannedQty: number;
  combinedPackScannedQty: number;
  /** No `fba_shipment_items` row existed — the scan added it on the fly. */
  isNew: boolean;
}

export function usePackerOrderPane() {
  const [activeOrderPane, setActiveOrderPane] = useState<PackActiveOrderPane | null>(null);
  const [activeFbaPane, setActiveFbaPane] = useState<PackActiveFbaPane | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PackActiveOrderPane | null>).detail;
      setActiveOrderPane(detail || null);
      // One entity in the operator's hands at a time (`display/station.md` §5).
      // An order scan retires a standing FBA card and vice versa — otherwise the
      // bench holds two active entities and the pane has to pick a winner every
      // render, which is the "two things that can disagree" shape.
      if (detail) setActiveFbaPane(null);
    };
    window.addEventListener('pack-active-order-changed', handler);
    return () => window.removeEventListener('pack-active-order-changed', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PackActiveFbaPane | null>).detail;
      setActiveFbaPane(detail || null);
      if (detail) setActiveOrderPane(null);
    };
    window.addEventListener('pack-active-fba-changed', handler);
    return () => window.removeEventListener('pack-active-fba-changed', handler);
  }, []);

  // Act-and-clear dwell: hold the active order for 2 minutes, then clear it so
  // `PackerRightPane` crossfades back to the history table. Every scan dispatches
  // a fresh pane object, so this effect re-runs and restarts the 2-minute window
  // (a new scan still replaces the card immediately). Manual close / unmount
  // clears the timer via cleanup.
  useEffect(() => {
    if (!activeOrderPane) return;
    const timer = setTimeout(() => setActiveOrderPane(null), ACTIVE_ORDER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activeOrderPane]);

  // Same act-and-clear dwell for the FBA card — a station bench must return to
  // "ready for the next scan" on its own, not hold the last entity forever.
  useEffect(() => {
    if (!activeFbaPane) return;
    const timer = setTimeout(() => setActiveFbaPane(null), ACTIVE_ORDER_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activeFbaPane]);

  return { activeOrderPane, setActiveOrderPane, activeFbaPane, setActiveFbaPane };
}

export function dispatchPackActiveOrder(detail: PackActiveOrderPane | null) {
  window.dispatchEvent(new CustomEvent('pack-active-order-changed', { detail }));
}

export function dispatchPackActiveFba(detail: PackActiveFbaPane | null) {
  window.dispatchEvent(new CustomEvent('pack-active-fba-changed', { detail }));
}
