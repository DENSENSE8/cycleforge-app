/** Structured shortage identity for an order line. */

export type OrderShortageKind = 'listing' | 'kit_part' | 'catalog_child' | 'catalog_other';

export type OrderShortageIdentity = {
  kind: OrderShortageKind;
  sku: string | null;
  skuCatalogId: number | null;
  kitPartId: number | null;
  qtyShort: number;
  title: string | null;
  zohoItemId: string | null;
  itemId: string | null;
};

export type OrderShortageIdentityPayload = {
  oosKind?: OrderShortageKind | null;
  oosSku?: string | null;
  oosSkuCatalogId?: number | null;
  oosKitPartId?: number | null;
  oosQtyShort?: number | null;
  oosTitle?: string | null;
  oosZohoItemId?: string | null;
  oosItemId?: string | null;
};

/** Empty identity — written when the hold is cleared. */
export const CLEAR_ORDER_SHORTAGE_IDENTITY: OrderShortageIdentityPayload = {
  oosKind: null,
  oosSku: null,
  oosSkuCatalogId: null,
  oosKitPartId: null,
  oosQtyShort: null,
  oosTitle: null,
  oosZohoItemId: null,
  oosItemId: null,
};

const KINDS = new Set<OrderShortageKind>(['listing', 'kit_part', 'catalog_child', 'catalog_other']);

export function listingShortageIdentity(args: {
  sku?: string | null;
  skuCatalogId?: number | null;
  title?: string | null;
  qtyShort?: number | null;
  zohoItemId?: string | null;
  itemId?: string | null;
}): OrderShortageIdentity {
  const qty = Number(args.qtyShort);
  return {
    kind: 'listing',
    sku: cleanText(args.sku),
    skuCatalogId: positiveInt(args.skuCatalogId),
    kitPartId: null,
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    title: cleanText(args.title),
    zohoItemId: cleanText(args.zohoItemId),
    itemId: cleanText(args.itemId),
  };
}

export function kitPartShortageIdentity(args: {
  sku?: string | null;
  skuCatalogId?: number | null;
  kitPartId?: number | null;
  title: string;
  qtyShort?: number | null;
  zohoItemId?: string | null;
  itemId?: string | null;
}): OrderShortageIdentity {
  const qty = Number(args.qtyShort);
  return {
    kind: 'kit_part',
    sku: cleanText(args.sku),
    skuCatalogId: positiveInt(args.skuCatalogId),
    kitPartId: positiveInt(args.kitPartId),
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    title: cleanText(args.title) || 'Kit part',
    zohoItemId: cleanText(args.zohoItemId),
    itemId: cleanText(args.itemId),
  };
}

export function catalogChildShortageIdentity(args: {
  sku?: string | null;
  skuCatalogId?: number | null;
  title: string;
  qtyShort?: number | null;
  zohoItemId?: string | null;
  itemId?: string | null;
}): OrderShortageIdentity {
  const qty = Number(args.qtyShort);
  return {
    kind: 'catalog_child',
    sku: cleanText(args.sku),
    skuCatalogId: positiveInt(args.skuCatalogId),
    kitPartId: null,
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    title: cleanText(args.title) || 'Component',
    zohoItemId: cleanText(args.zohoItemId),
    itemId: cleanText(args.itemId),
  };
}

export function catalogOtherShortageIdentity(args: {
  sku?: string | null;
  skuCatalogId?: number | null;
  title: string;
  qtyShort?: number | null;
  zohoItemId?: string | null;
  itemId?: string | null;
}): OrderShortageIdentity {
  const qty = Number(args.qtyShort);
  return {
    kind: 'catalog_other',
    sku: cleanText(args.sku),
    skuCatalogId: positiveInt(args.skuCatalogId),
    kitPartId: null,
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    title: cleanText(args.title) || 'Inventory item',
    zohoItemId: cleanText(args.zohoItemId),
    itemId: cleanText(args.itemId),
  };
}

export function shortageIdentityToPayload(
  identity: OrderShortageIdentity | null | undefined,
): OrderShortageIdentityPayload {
  if (!identity) return CLEAR_ORDER_SHORTAGE_IDENTITY;
  return {
    oosKind: identity.kind,
    oosSku: identity.sku,
    oosSkuCatalogId: identity.skuCatalogId,
    oosKitPartId: identity.kitPartId,
    oosQtyShort: identity.qtyShort,
    oosTitle: identity.title,
    oosZohoItemId: identity.zohoItemId,
    oosItemId: identity.itemId,
  };
}

export function shortageZohoKey(
  identity: Pick<OrderShortageIdentity, 'zohoItemId' | 'skuCatalogId' | 'sku' | 'kitPartId'>,
): string {
  const zoho = cleanText(identity.zohoItemId);
  if (zoho) return zoho;
  if (identity.kitPartId) return `kit-part:${identity.kitPartId}`;
  if (identity.skuCatalogId) return `catalog:${identity.skuCatalogId}`;
  const sku = cleanText(identity.sku);
  if (sku) return `sku:${sku}`;
  return 'unlinked';
}

/** Read identity from a row that may use snake_case (API) or camelCase (payload). */
export function shortageIdentityFromRow(row: {
  oos_kind?: string | null;
  oos_sku?: string | null;
  oos_sku_catalog_id?: number | null;
  oos_kit_part_id?: number | null;
  oos_qty_short?: number | string | null;
  oos_title?: string | null;
  oos_zoho_item_id?: string | null;
  oos_item_id?: string | null;
  oosKind?: string | null;
  oosSku?: string | null;
  oosSkuCatalogId?: number | null;
  oosKitPartId?: number | null;
  oosQtyShort?: number | string | null;
  oosTitle?: string | null;
  oosZohoItemId?: string | null;
  oosItemId?: string | null;
} | null | undefined): OrderShortageIdentity | null {
  if (!row) return null;
  const kindRaw = String(row.oos_kind ?? row.oosKind ?? '').trim();
  if (!KINDS.has(kindRaw as OrderShortageKind)) return null;
  const qty = Number(row.oos_qty_short ?? row.oosQtyShort ?? 1);
  return {
    kind: kindRaw as OrderShortageKind,
    sku: cleanText(row.oos_sku ?? row.oosSku),
    skuCatalogId: positiveInt(row.oos_sku_catalog_id ?? row.oosSkuCatalogId),
    kitPartId: positiveInt(row.oos_kit_part_id ?? row.oosKitPartId),
    qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
    title: cleanText(row.oos_title ?? row.oosTitle),
    zohoItemId: cleanText(row.oos_zoho_item_id ?? row.oosZohoItemId),
    itemId: cleanText(row.oos_item_id ?? row.oosItemId),
  };
}

function cleanText(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
