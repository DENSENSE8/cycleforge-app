'use client';

/**
 * Right-pane order state for the packer dashboard: a scanned/selected order
 * overlays the Queue · History browse workbench (Unbox pattern).
 */

import { useEffect, useState } from 'react';

export interface PackActiveOrderPane {
  orderRowId: number | null;
  orderId: string;
  productTitle: string;
  qty: number;
  condition: string;
  tracking: string;
  sku?: string;
  scanType?: 'ORDERS' | 'REPAIR' | 'UNIT';
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

/** An FBA scan is the OTHER active entity this bench resolves — a shipment / FNSKU, not an order — so it gets its own pane rather than… */
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

  return { activeOrderPane, setActiveOrderPane, activeFbaPane, setActiveFbaPane };
}

export function dispatchPackActiveOrder(detail: PackActiveOrderPane | null) {
  window.dispatchEvent(new CustomEvent('pack-active-order-changed', { detail }));
}

export function dispatchPackActiveFba(detail: PackActiveFbaPane | null) {
  window.dispatchEvent(new CustomEvent('pack-active-fba-changed', { detail }));
}
