/**
 * Orders row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The second family adapter into the shared compound renderer. It exists so
 * Orders can join the one layout WITHOUT copying a cell — which is the whole
 * point of the view-model seam.
 */

import {
  firstNote,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { ShippedOrder } from '@/types/orders';

/**
 * Fulfillment lane → the three-tone vocabulary.
 *
 * `BLOCKED` is the only lane that needs a human, so it is the only `alert`.
 * `TESTED` / packed / shipped are progress that has completed a step (`done`);
 * everything else is ordinary queue movement and stays neutral, so a floor
 * screen reserves its one loud colour for the row that is actually stuck.
 */
export function ordersStateTone(stateLabel: string | null | undefined): CompoundStateTone {
  const s = String(stateLabel || '').toUpperCase();
  if (!s) return 'neutral';
  if (s.includes('BLOCK') || s.includes('OUT OF STOCK') || s.includes('EXCEPTION') || s.includes('HOLD')) {
    return 'alert';
  }
  if (s.includes('TESTED') || s.includes('PACKED') || s.includes('SHIPPED') || s.includes('SCANNED')) {
    return 'done';
  }
  return 'neutral';
}

export interface OrdersCompoundParts {
  /** Lane label already resolved by `resolveRowStatus` for this queueMode. */
  stateLabel: string;
  /** Whole days past ship-by; null when the order has no deadline. */
  delayDays: number | null;
  delayTip?: string;
}

export function ordersCompoundView(
  record: ShippedOrder,
  parts: OrdersCompoundParts,
): CompoundRowView {
  const row = record as ShippedOrder & {
    tracking_number?: string | null;
    account_source?: string | null;
    carrier?: string | null;
  };
  const tracking = String(row.shipping_tracking_number || row.tracking_number || '').trim();

  return {
    id: String(record.id),
    // NO photo on the orders row model — `ShippedOrder` carries no image field,
    // so this renders the typed placeholder. Adding one is a query + row-model
    // change (join the catalog listing image), not a cell change; until then the
    // column is an honest empty rather than a fabricated thumbnail.
    thumbUrl: null,
    title: record.product_title || '',
    note: firstNote([record.notes]),
    orderId: String(record.order_id || '').trim() || null,
    tracking: tracking || null,
    // Marketplace/channel the order came from — the platform SoT resolves the mark.
    platformValue: row.account_source || null,
    carrier: row.carrier || null,
    stateLabel: parts.stateLabel,
    stateTone: ordersStateTone(parts.stateLabel),
    delay:
      parts.delayDays == null ? null : { days: parts.delayDays, overdue: parts.delayDays > 0 },
    delayTip: parts.delayTip,
  };
}
