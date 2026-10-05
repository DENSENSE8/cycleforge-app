/**
 * The ONE browser client for the dock scan-out verb (`/api/shipped/scan-out`):
 * POST confirms a label, DELETE undoes a confirm. Shared by the desk scan-out
 * station and the phone `/m/scan` Out direction so both speak the same contract.
 */

export interface ScanOutResult {
  ok: boolean;
  matched: boolean;
  duplicate?: boolean;
  /** Order is in a state that must never leave (`canceled` / `cancelled`). */
  blocked?: boolean;
  blockReason?: string | null;
  orderStatus?: string | null;
  shipConfirmedAt?: string | null;
  shipmentId?: number;
  tracking?: string | null;
  receivingId?: number | null;
  orderRowId?: number | null;
  orderId?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
  quantity?: number | null;
  accountSource?: string | null;
  imageUrl?: string | null;
  message?: string | null;
  /** A miss held as an open unmatched scan on Fulfilled (`orders_exceptions.id`). */
  exceptionId?: number | null;
}

export async function postScanOut(tracking: string): Promise<ScanOutResult> {
  const res = await fetch('/api/shipped/scan-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingNumber: tracking }),
  });
  if (!res.ok) throw new Error(`scan-out failed (${res.status})`);
  return res.json();
}

export async function undoScanOut(shipmentId: number): Promise<void> {
  const res = await fetch('/api/shipped/scan-out', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipmentId }),
  });
  if (!res.ok) throw new Error(`undo failed (${res.status})`);
}
