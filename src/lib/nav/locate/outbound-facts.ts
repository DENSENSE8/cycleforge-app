/**
 * The outbound locator's row-facts builder (`NavLocateFacts`, section
 * `outbound`) for its refs answer (`./outbound.ts`). Pure — no database
 * import — so its domain tests run DB-free. (Fulfilled's lines are Records
 * lines: `locateRecordLine`.)
 */

import type { NavLocateFacts } from '@/lib/nav/context/schema';
import { carrierStatusLabel } from '@/lib/status/record-status';
import { pickedByFromRow } from '@/lib/picking/picked-by';

/** A wire stamp: node-pg hands timestamptz back as `Date`. */
function stampText(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

const textOf = (value: unknown): string | null => (value == null ? null : String(value).trim() || null);

/** One matched order's row facts (the ref's lead order when it names several). */
export function outboundFacts(row: Record<string, unknown>, lines: number): NavLocateFacts {
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
    ...('carrier_category' in row ? outboundCarrierFacts(row) : {}),
  };
}

/**
 * The carrier's side of the lead package, on a locator answer (the pasted
 * list): the carrier, its latest event (words, place, when), the ETA and the
 * last poll — the same facts the Fulfilled sheet paints.
 */
function outboundCarrierFacts(row: Record<string, unknown>): Partial<NavLocateFacts> {
  const category = textOf(row.carrier_category)?.toUpperCase() ?? null;
  const label = textOf(row.carrier_label);
  const at = stampText(row.carrier_event_at);
  const checkedAt = stampText(row.carrier_checked_at);
  const error = textOf(row.carrier_error)?.split('\n')[0]!.trim().slice(0, 160) || null;
  return {
    carrier: textOf(row.carrier),
    lastEvent: label || at || category ? { label, at, status: carrierStatusLabel(category) } : null,
    lastEventPlace: textOf(row.carrier_place),
    eta: stampText(row.carrier_eta),
    lastPoll: checkedAt || error ? { at: checkedAt, error } : null,
  };
}
