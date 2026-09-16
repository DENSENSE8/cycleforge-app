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
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';

 export interface ReceivingGroupIdentityRow {
   zoho_purchaseorder_number?: string | null;
   zoho_purchaseorder_id?: string | null;
  source_platform?: string | null;
   inbound_source_type?: string | null;
   source_order_id?: string | null;
 }

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/**
 * A fold paints the plain order-chip face with its platform color dot — the
 * exact face every leaf paints (operator 2026-09-14: "it must display with
 * the color dot icon just like the other items — all consistent"). Returns
 * null when the fold has no shared identity at all — the band then shows only
 * the box count rather than inventing a label.
 */
export function receivingGroupIdentity(
  rows: readonly ReceivingGroupIdentityRow[],
): SlotTableGroupIdentity | null {
   const po = rows.map((r) => clean(r.zoho_purchaseorder_number) || clean(r.zoho_purchaseorder_id)).find(Boolean);
  if (po) {
    // Operator 2026-09-14: the band paints the SAME platform color dot every
    // leaf paints (ReceivingOrderCell's BrandIdentityDot) — one grammar, no
    // dot-less band beside dotted leaves. Derived identically: the number's
    // own marketplace shape, falling back to the row's source platform.
    const platformRow = rows.find((r) => clean(r.source_platform));
    const meta = resolveMarketplacePlatformMeta(
      po,
      platformRow ? sourcePlatformMeta(clean(platformRow.source_platform)) : undefined,
    );
    return {
      kind: 'po',
      value: po,
      dot: platformMetaBrandDot(meta),
      platformLabel: meta.value ? meta.label : null,
    };
  }

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
