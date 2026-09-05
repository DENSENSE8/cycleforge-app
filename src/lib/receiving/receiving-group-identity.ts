/**
 * What an Unbox / Inbound fold IS — the facts the shared group-parent band
 * needs from a `ReceivingLineRow[]`.
 *
 * Mirrors `orderCarrierBoxes` for the orders lane: the band is engine-owned and
 * DATA-driven, so each family supplies its identity here rather than growing
 * its own parent row. Pure, so it tests without React.
 *
 * The key must agree with `useReceivingGrouping`, which folds on the Zoho PO
 * number (or id), then on `{source}:{external order id}` for marketplace buys
 * that have no PO — "operators think in orders/boxes", as that module puts it.
 */

import type { SlotTableGroupIdentity } from '@/components/tables/compound/SlotTableGroupParentRow';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';

export interface ReceivingGroupIdentityRow {
  zoho_purchaseorder_number?: string | null;
  zoho_purchaseorder_id?: string | null;
  inbound_source_type?: string | null;
  source_order_id?: string | null;
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/**
 * A PO fold paints a `PoChip`; a marketplace fold paints the order chip with
 * its platform dot. Returns null when the fold has no shared identity at all —
 * the band then shows only the box count rather than inventing a label.
 */
export function receivingGroupIdentity(
  rows: readonly ReceivingGroupIdentityRow[],
): SlotTableGroupIdentity | null {
  const po = rows.map((r) => clean(r.zoho_purchaseorder_number) || clean(r.zoho_purchaseorder_id)).find(Boolean);
  if (po) return { kind: 'po', value: po };

  const withOrder = rows.find((r) => clean(r.source_order_id));
  if (!withOrder) return null;

  const orderId = clean(withOrder.source_order_id);
  const source = clean(withOrder.inbound_source_type);
  const meta = source ? sourcePlatformMeta(source) : null;
  return {
    kind: 'order',
    value: orderId,
    dot: meta ? platformMetaBrandDot(meta) : undefined,
    platformLabel: meta?.label ?? null,
  };
}
