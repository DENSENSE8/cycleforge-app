/**
 * A desk's bin count writes, as request builders.
 *
 * Nothing here invents an endpoint: an adjust is the `put` / `take` the phone
 * and the scan gun already send to `PATCH /api/locations/[barcode]`
 * (`adjustBinQty`), which is what keeps the ledger row, the `sku_stock`
 * recompute and the `STOCK_DELTA_*` publish identical on every surface.
 *
 * Every request carries a fresh `Idempotency-Key`, which the route reads
 * (`readIdempotencyKey`) and caches its response against, so a retried press
 * replays rather than writing twice.
 */

import { safeRandomUUID } from '../safe-uuid';
import type { StockBinWriteTarget } from './stock-bin-writes';

/** Direction of a count adjustment — `in` adds, `out` subtracts. */
export type StockAdjustDirection = 'in' | 'out';

export interface StockBinRequest {
  url: string;
  init: RequestInit;
}

/**
 * A `put` / `take` on one bin. The idempotency key is generated per CALL, so a
 * retry of the same `fetch` replays and two deliberate presses are two writes.
 */
export function stockAdjustRequest(
  target: StockBinWriteTarget,
  args: {
    direction: StockAdjustDirection;
    qty: number;
    staffId?: number;
    /** `reason_codes.code` — the legacy free-text column keeps the code word. */
    reasonCode?: string;
    /** `reason_codes.id` — the categorized fact the phone writes. */
    reasonCodeId?: number;
    notes?: string;
  },
): StockBinRequest {
  const clientEventId = safeRandomUUID();
  return {
    url: `/api/locations/${encodeURIComponent(target.barcode)}`,
    init: {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': clientEventId,
      },
      body: JSON.stringify({
        action: args.direction === 'in' ? 'put' : 'take',
        sku: target.sku,
        qty: args.qty,
        staffId: args.staffId,
        reason: args.reasonCode,
        reasonCodeId: args.reasonCodeId,
        notes: args.notes,
        clientEventId,
      }),
    },
  };
}

/**
 * Fire one request and turn a non-2xx — or a 200 carrying
 * `{ success: false }` — into a real `Error` with the route's own message.
 */
export async function commitStockRequest({ url, init }: StockBinRequest): Promise<void> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: string; message?: string }
    | null;
  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
  }
}
