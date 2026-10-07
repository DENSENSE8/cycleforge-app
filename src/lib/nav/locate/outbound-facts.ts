/**
 * The ONE outbound row-facts builder (`NavLocateFacts`, section `outbound`):
 * the outbound locator's refs answer (`./outbound.ts`) and the Fulfilled
 * sheet (`src/lib/nav/fulfilled/service.ts`) both paint through it. Pure — no
 * database import — so either caller's domain tests run DB-free.
 */

import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { pickedByFromRow } from '@/lib/picking/picked-by';

/** A wire stamp: node-pg hands timestamptz back as `Date`. */
function stampText(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

const textOf = (value: unknown): string | null => (value == null ? null : String(value).trim() || null);

/** The Fulfilled sheet's extra facts (`GET /api/nav/fulfilled`, `src/lib/nav/fulfilled/service.ts`); absent on locator answers. */
export type OutboundFulfilledFacts = Required<
  Pick<
    NavLocateFacts,
    | 'channel'
    | 'customer'
    | 'qty'
    | 'orderTotal'
    | 'orderedAt'
    | 'scannedOutBy'
    | 'scanSource'
    | 'carrier'
    | 'service'
    | 'labelCreatedAt'
    | 'labelCost'
    | 'firstScanAt'
    | 'lastEvent'
    | 'lastEventPlace'
    | 'eta'
    | 'attempts'
    | 'exceptionCode'
    | 'lastPoll'
    | 'packages'
    | 'trackings'
    | 'returnRef'
    | 'shipstationStatus'
    | 'transitDays'
    | 'claim'
    | 'lineCount'
  >
>;

/** One matched order's row facts (the ref's lead order when it names several), plus the Fulfilled sheet's when it reads them. */
export function outboundFacts(row: Record<string, unknown>, lines: number, fulfilled?: OutboundFulfilledFacts): NavLocateFacts {
  const packerId = Number(row.packer_id);
  const packerName = textOf(row.packer_name);
  const hasPacker = Number.isInteger(packerId) && packerId > 0;
  return {
    section: 'outbound',
    title: textOf(row.fact_title),
    sku: textOf(row.sku),
    tracking: textOf(row.tracking_number),
    deliveredAt: stampText(row.delivered_at),
    // The source's word (`orders.status`), never the warehouse stage — that is the bucket.
    channelStatus: textOf(row.status),
    shipBy: textOf(row.ship_by_date),
    pickedAt: stampText(row.picked_at),
    pickedBy: pickedByFromRow(row),
    packedAt: stampText(row.packed_at),
    shippedAt: stampText(row.shipped_at),
    packer: hasPacker || packerName ? { id: hasPacker ? packerId : null, name: packerName } : null,
    po: null,
    vendor: null,
    lines,
    duplicates: [],
    unboxedAt: null,
    unboxedBy: null,
    units: null,
    ...fulfilled,
  };
}
