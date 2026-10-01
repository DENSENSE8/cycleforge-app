/**
 * Scan-out JobFace mapper — POST/GET carton JSON → IdentificationResult.
 * Scan-out refuses cancellation and cartons without a completed pack. Carrier
 * delivery state does not authorize or block SHIP_CONFIRM. Dual-entry:
 * `source: 'scan'` (gun) and `source: 'claim'` (GET ?orderId=) share this function.
 */

import type {
  IdentificationResult,
  IdentificationSource,
  JobFace,
  JobFaceState,
} from './types';

export interface ScanOutCartonJson {
  ok?: boolean;
  matched?: boolean;
  blocked?: boolean;
  blockReason?: string | null;
  duplicate?: boolean;
  ambiguous?: boolean;
  candidates?: unknown[];
  orderRowId?: number | null;
  orderId?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
  quantity?: number | null;
  tracking?: string | null;
  shipmentId?: number | null;
  imageUrl?: string | null;
  orderStatus?: string | null;
  message?: string | null;
}

export interface ScanOutHistoryEntry {
  orderId?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  condition?: string | null;
  quantity?: number | null;
  tracking?: string | null;
  shipmentId?: number | null;
  imageUrl?: string | null;
}

const BLOCKED_STATUSES = new Set(['canceled', 'cancelled', 'blk']);

function isBlockedStatus(value: string | null | undefined): boolean {
  return BLOCKED_STATUSES.has(String(value ?? '').trim().toLowerCase());
}

export function scanOutHistoryEntryToCarton(entry: ScanOutHistoryEntry): ScanOutCartonJson {
  return {
    ok: true,
    matched: true,
    duplicate: true,
    orderId: entry.orderId ?? null,
    productTitle: entry.productTitle ?? null,
    sku: entry.sku ?? null,
    condition: entry.condition ?? null,
    quantity: entry.quantity ?? null,
    tracking: entry.tracking ?? null,
    shipmentId: entry.shipmentId ?? null,
    imageUrl: entry.imageUrl ?? null,
  };
}

function entityId(json: ScanOutCartonJson, requestedKey?: string): string {
  if (json.orderRowId != null && Number(json.orderRowId) > 0) {
    return String(json.orderRowId);
  }
  const market = String(json.orderId ?? '').trim();
  if (market) return market;
  return String(requestedKey ?? '').trim();
}

function faceFor(json: ScanOutCartonJson, source: IdentificationSource): JobFace {
  const blocked =
    json.blocked === true ||
    isBlockedStatus(json.blockReason) ||
    isBlockedStatus(json.orderStatus);
  const ambiguous =
    json.ambiguous === true ||
    (Array.isArray(json.candidates) && json.candidates.length > 1);

  let state: JobFaceState;
  let title: string;
  let mutate: JobFace['mutate'] = null;
  const message = json.message ?? null;

  if (json.ok === false) {
    state = 'error';
    title = 'Scan-out failed';
  } else if (ambiguous) {
    state = 'ambiguous';
    title = 'More than one match';
  } else if (json.matched === false) {
    state = 'miss';
    title = 'No order found';
  } else if (blocked) {
    state = 'blocked';
    title = 'Do not ship';
  } else if (json.duplicate === true) {
    state = 'done';
    title = 'Already fulfilled';
  } else if (source === 'claim') {
    state = 'ready';
    title = 'Ready to scan out';
    mutate = 'SHIP_CONFIRM';
  } else {
    state = 'done';
    title = 'Fulfilled';
  }

  return { state, title, message, mutate };
}

export function identificationFromScanOut(args: {
  source: IdentificationSource;
  organizationId: string;
  clientEventId: string;
  json: ScanOutCartonJson;
  requestedKey?: string;
}): IdentificationResult {
  const organizationId = String(args.organizationId ?? '').trim();
  const clientEventId = String(args.clientEventId ?? '').trim();
  if (!organizationId) throw new Error('organizationId required');
  if (!clientEventId) throw new Error('clientEventId required');

  const id = entityId(args.json, args.requestedKey);

  return {
    organizationId,
    clientEventId,
    job: 'scan_out',
    source: args.source,
    entity: { kind: 'order', id },
    face: faceFor(args.json, args.source),
  };
}
