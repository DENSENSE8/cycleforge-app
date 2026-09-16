/**
 * The Stock desk's writes, as request builders — one per verb.
 *
 * They live beside {@link planStockBinWrites} rather than inside the strip so
 * the URL, the body and the idempotency header are readable without scrolling
 * past a toolbar, and so a future surface (the phone's move screen) reuses the
 * same request shape instead of re-deriving it from a component.
 *
 * Nothing here invents an endpoint. Each verb names one the phone and the scan
 * gun already call, which is what keeps the ledger row, the `sku_stock`
 * recompute and the inventory event identical on every surface:
 *
 * | verb | endpoint | writer |
 * |---|---|---|
 * | adjust | `PATCH /api/locations/[barcode]` `put` / `take` | `adjustBinQty` |
 * | move | `POST /api/transfers` | `adjustBinQty` twice + one `MOVED` event |
 * | delete | `PATCH /api/locations/[barcode]` `take` of the whole row | `adjustBinQty` |
 * | replace (swap) | `POST /api/locations/[barcode]/swap` | `adjustBinQty` twice (`SWAP_OUT` / `SWAP_IN`) |
 * | replace (pair) | `POST /api/sku-catalog/provisional/merge` | `mergeProvisionalSku` — re-keys bins + ledger, SKU-wide |
 *
 * **Why delete is a `take` and not a `set 0`.** `action: 'set'` upserts
 * `bin_contents` directly: no ledger row, no stock recompute. The feed already
 * excludes `qty = 0`, so both make the row disappear — but only one of them
 * leaves the warehouse's books agreeing with its shelves.
 *
 * Every bin request carries a fresh `Idempotency-Key`, which those routes read
 * (`readIdempotencyKey`) and cache their response against, so a retried press
 * replays rather than writing twice. The provisional MERGE is the exception
 * and says why on {@link stockPairProvisionalRequest}.
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
 * One request's fixed parts. The key is generated per CALL, so a retry of the
 * same `fetch` replays and two deliberate presses are two writes.
 */
function jsonRequest(url: string, method: 'PATCH' | 'POST', body: Record<string, unknown>): StockBinRequest {
  const clientEventId = safeRandomUUID();
  return {
    url,
    init: {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': clientEventId,
      },
      body: JSON.stringify({ ...body, clientEventId }),
    },
  };
}

function binUrl(barcode: string): string {
  return `/api/locations/${encodeURIComponent(barcode)}`;
}

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
  return jsonRequest(binUrl(target.barcode), 'PATCH', {
    action: args.direction === 'in' ? 'put' : 'take',
    sku: target.sku,
    qty: args.qty,
    staffId: args.staffId,
    reason: args.reasonCode,
    reasonCodeId: args.reasonCodeId,
    notes: args.notes,
  });
}

export function stockMoveRequest(
  target: StockBinWriteTarget,
  args: {
    /** Destination BARCODE — `/api/transfers` resolves both bins by barcode. */
    toBarcode: string;
    /** Omitted moves the whole row, which is the common desk intent. */
    qty?: number;
    staffId?: number;
  },
): StockBinRequest {
  return jsonRequest('/api/transfers', 'POST', {
    fromBinBarcode: target.barcode,
    toBinBarcode: args.toBarcode,
    sku: target.sku,
    qty: args.qty ?? target.qty,
    staffId: args.staffId,
  });
}

/**
 * Remove the pairing: take the WHOLE count out of the bin.
 *
 * A delete that left 3 behind would be an adjust wearing the wrong word, so the
 * quantity is the row's own on-hand and there is no qty input.
 */
export function stockDeleteRequest(
  target: StockBinWriteTarget,
  args: { staffId?: number },
): StockBinRequest {
  return jsonRequest(binUrl(target.barcode), 'PATCH', {
    action: 'take',
    sku: target.sku,
    qty: target.qty,
    staffId: args.staffId,
    /** The phone's pull code, so both surfaces read as one verb in the ledger. */
    reason: 'BIN_PULL',
  });
}

/**
 * Replace the SKU a bin row stands on — `POST /api/locations/[barcode]/swap`.
 *
 * The route takes the stock OFF the old SKU and PUTS it on the new one in the
 * same bin, each leg through `adjustBinQty`, so the ledger shows `SWAP_OUT` /
 * `SWAP_IN` rather than a silent rename. Omitting `qty` swaps the whole row,
 * which is the usual intent ("this bin is really that product"); a supplied
 * qty is clamped to what is there.
 *
 * Distinct from {@link stockPairProvisionalRequest}: this is one BIN and a
 * quantity. Nothing historical moves, because nothing was misnamed.
 */
export function stockSwapRequest(
  target: StockBinWriteTarget,
  args: { newSku: string; qty?: number; staffId?: number },
): StockBinRequest {
  return jsonRequest(`${binUrl(target.barcode)}/swap`, 'POST', {
    oldSku: target.sku,
    newSku: args.newSku,
    qty: args.qty,
    // The swap route gates on `assertPermission(body.staffId, 'bin.swap')`, so
    // the acting staffer is load-bearing here rather than decorative.
    staffId: args.staffId,
  });
}

/**
 * Pair a floor placeholder to the real product —
 * `POST /api/sku-catalog/provisional/merge`.
 *
 * SKU-WIDE and historical: `mergeProvisionalSku` re-keys every `bin_contents`
 * row and the placeholder's whole `sku_stock_ledger` history onto the target,
 * records the rename in `provisional_sku_merges`, and deletes the placeholder.
 * One call per placeholder — never one per selected row, which would 404 on
 * the second (the placeholder is gone by then).
 *
 * It carries no `clientEventId`: that route reads no idempotency key, and the
 * write is self-cancelling — a replay finds no placeholder and answers 404
 * rather than merging twice.
 */
export function stockPairProvisionalRequest(args: {
  provisionalSku: string;
  targetSku: string;
  staffId?: number;
}): StockBinRequest {
  return {
    url: '/api/sku-catalog/provisional/merge',
    init: {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provisionalSku: args.provisionalSku,
        targetSku: args.targetSku,
        staffId: args.staffId,
      }),
    },
  };
}

/**
 * Fire one request and turn a non-2xx — or a 200 carrying
 * `{ success: false }` — into a real `Error`. Both routes answer that way, and
 * `/api/transfers` puts its short-transfer refusal in `message`
 * (`INSUFFICIENT_QTY`: "Source bin only has 2; cannot move 5.").
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

/** Run one write per target; keep the first real failure as the message. */
export async function commitStockWrites(
  targets: readonly StockBinWriteTarget[],
  request: (target: StockBinWriteTarget) => StockBinRequest,
): Promise<{ ok: number; failed: number; reason: string | null }> {
  const results = await Promise.allSettled(
    targets.map((target) => commitStockRequest(request(target))),
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const reason =
    rejected.length > 0
      ? rejected[0].reason instanceof Error
        ? rejected[0].reason.message
        : String(rejected[0].reason)
      : null;
  return { ok: results.length - rejected.length, failed: rejected.length, reason };
}
