/**
 * Scan-out active carton — shared between the sidebar gun, recent rail, and
 * center workbench via window events (Pack / Unbox pattern: the trees are
 * siblings under the shipping layout, not one React provider).
 */

export type ScanOutFocusStatus =
  | 'ok'
  | 'dup'
  | 'miss'
  | 'err'
  | 'blk'
  | 'pending';

export interface ScanOutActivePane {
  /** Internal `orders.id` when resolved. */
  orderRowId: number | null;
  orderId: string;
  productTitle: string;
  qty: number;
  condition: string;
  tracking: string;
  sku: string;
  itemNumber: string | null;
  shipmentId: number | null;
  accountSource: string | null;
  /** True when the dock gun opened this pane (affects remount key). */
  scanDriven: boolean;
  status: ScanOutFocusStatus;
  message?: string | null;
}

export const SCAN_OUT_ACTIVE_EVENT = 'scan-out-active-changed';
/** Fired after a dock confirm settles — rail prepends / invalidates. */
const SCAN_OUT_CONFIRMED_EVENT = 'scan-out-confirmed';
/** Composer procedure ring → open Displays Root Index (verify carton). */
export const SCAN_OUT_OPEN_DISPLAYS_EVENT = 'scan-out-open-displays';
/** Composer procedure ring toggle-off / panel close. */
export const SCAN_OUT_CLOSE_DISPLAYS_EVENT = 'scan-out-close-displays';
/** Panel → dock: keep the context ring pressed state in sync. */
export const SCAN_OUT_DISPLAYS_CHANGED_EVENT = 'scan-out-displays-changed';

export function dispatchScanOutActive(detail: ScanOutActivePane | null) {
  window.dispatchEvent(new CustomEvent(SCAN_OUT_ACTIVE_EVENT, { detail }));
}

export function dispatchScanOutConfirmed(detail: ScanOutActivePane) {
  window.dispatchEvent(new CustomEvent(SCAN_OUT_CONFIRMED_EVENT, { detail }));
}

export function dispatchScanOutOpenDisplays() {
  window.dispatchEvent(new CustomEvent(SCAN_OUT_OPEN_DISPLAYS_EVENT));
}

export function dispatchScanOutCloseDisplays() {
  window.dispatchEvent(new CustomEvent(SCAN_OUT_CLOSE_DISPLAYS_EVENT));
}

export function dispatchScanOutDisplaysChanged(open: boolean) {
  window.dispatchEvent(
    new CustomEvent(SCAN_OUT_DISPLAYS_CHANGED_EVENT, { detail: { open } }),
  );
}

export function resultToScanOutPane(
  result: {
    shipmentId?: number;
    tracking?: string | null;
    orderRowId?: number | null;
    orderId?: string | null;
    productTitle?: string | null;
    sku?: string | null;
    itemNumber?: string | null;
    condition?: string | null;
    quantity?: number | null;
    accountSource?: string | null;
    message?: string | null;
  },
  status: ScanOutFocusStatus,
  scannedRaw: string,
): ScanOutActivePane {
  const tracking = String(result.tracking || scannedRaw || '').trim();
  const qty = Number(result.quantity);
  return {
    orderRowId: result.orderRowId != null && result.orderRowId > 0 ? Number(result.orderRowId) : null,
    orderId: String(result.orderId || '').trim(),
    productTitle: String(result.productTitle || '').trim() || tracking || 'Shipment',
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    condition: String(result.condition || '').trim(),
    tracking,
    sku: String(result.sku || '').trim(),
    itemNumber: result.itemNumber != null ? String(result.itemNumber).trim() || null : null,
    shipmentId: result.shipmentId != null && result.shipmentId > 0 ? Number(result.shipmentId) : null,
    accountSource: result.accountSource != null ? String(result.accountSource) : null,
    scanDriven: true,
    status,
    message: result.message ?? null,
  };
}
