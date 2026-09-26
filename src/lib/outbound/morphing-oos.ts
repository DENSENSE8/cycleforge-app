/** Morphing Out-of-stock picker helpers — pure decision + identity builders. */

import {
  catalogChildShortageIdentity,
  kitPartShortageIdentity,
  listingShortageIdentity,
  shortageIdentityToPayload,
  type OrderShortageIdentity,
} from '@/lib/orders/order-shortage-identity';
import type { OrderAssignPayload } from '@/hooks/useOrderAssignment';

export type MorphingOosRow = {
  id?: number | string | null;
  order_id?: string | null;
  sku?: string | null;
  sku_catalog_id?: number | null;
  zoho_item_id?: string | null;
  catalog_image_url?: string | null;
  product_title?: string | null;
  quantity?: string | number | null;
  packed_at?: string | null;
};

type MorphingOosView = 'oos-pick';

export function morphingOosOrderId(row: MorphingOosRow): number | null {
  const id = Number(row.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** True when selection is multiple lines of the same commercial order. */
export function morphingOosIsFoldSelection(rows: readonly MorphingOosRow[]): boolean {
  if (rows.length < 2) return false;
  const keys = new Set(
    rows.map((row) => String(row.order_id || '').trim()).filter(Boolean),
  );
  return keys.size === 1;
}

export function morphingOosStaysPacked(rows: readonly MorphingOosRow[]): boolean {
  return rows.length > 0 && rows.every((row) => Boolean(String(row.packed_at || '').trim()));
}

export function morphingListingIdentity(row: MorphingOosRow): OrderShortageIdentity {
  const qty = Number(row.quantity);
  return listingShortageIdentity({
    sku: row.sku,
    skuCatalogId: row.sku_catalog_id,
    title: row.product_title,
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    zohoItemId: row.zoho_item_id,
  });
}

function morphingKitPartIdentity(
  row: MorphingOosRow,
  part: { id: number; component_name: string; qty_required?: number },
): OrderShortageIdentity {
  return kitPartShortageIdentity({
    sku: row.sku,
    skuCatalogId: row.sku_catalog_id,
    kitPartId: part.id,
    title: part.component_name,
    qtyShort: part.qty_required ?? 1,
  });
}

/** Catalog-edge child (sku_relationships) — multi-tenant bundle component. */
function morphingCatalogChildIdentity(args: {
  childSku: string | null;
  childSkuCatalogId: number;
  title: string;
  qtyShort?: number | null;
  zohoItemId?: string | null;
}): OrderShortageIdentity {
  return catalogChildShortageIdentity({
    sku: args.childSku,
    skuCatalogId: args.childSkuCatalogId,
    title: args.title,
    qtyShort: args.qtyShort ?? 1,
    zohoItemId: args.zohoItemId,
  });
}

export function morphingComponentIdentity(
  row: MorphingOosRow,
  component: {
    source: 'catalog_edge' | 'kit_part';
    title: string;
    sku: string | null;
    qty: number;
    childSkuCatalogId?: number | null;
    kitPartId?: number | null;
  },
): OrderShortageIdentity {
  if (component.source === 'catalog_edge' && component.childSkuCatalogId) {
    return morphingCatalogChildIdentity({
      childSku: component.sku,
      childSkuCatalogId: component.childSkuCatalogId,
      title: component.title,
      qtyShort: component.qty,
    });
  }
  return morphingKitPartIdentity(row, {
    id: component.kitPartId ?? 0,
    component_name: component.title,
    qty_required: component.qty,
  });
}

export function morphingOosAssignPayload(
  orderIds: number[],
  identity: OrderShortageIdentity,
): OrderAssignPayload {
  return {
    orderIds,
    isOutOfStock: true,
    ...shortageIdentityToPayload(identity),
  };
}

/**
 * First picker view after pressing Out of stock / O.
 * Same-order fold or a single line → Zoho product combobox (never line indexes).
 * Distinct commercial orders → commit each listing.
 */
export function morphingOosStartView(rows: readonly MorphingOosRow[]): MorphingOosView | 'commit-multi' {
  if (rows.length === 0) return 'oos-pick';
  if (morphingOosIsFoldSelection(rows)) return 'oos-pick';
  if (rows.length > 1) return 'commit-multi';
  return 'oos-pick';
}
