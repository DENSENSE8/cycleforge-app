/**
 * Combobox option encoding for item-level OOS.
 *
 * Values are Zoho products bound to an order line — never synthetic "line-N".
 * Callers: MorphingRowActionMenu, OosProductCombobox.
 */

import type { KitComposition } from '@/lib/orders/order-kit-composition';
import {
  catalogChildShortageIdentity,
  catalogOtherShortageIdentity,
  kitPartShortageIdentity,
  listingShortageIdentity,
  type OrderShortageIdentity,
  type OrderShortageKind,
} from '@/lib/orders/order-shortage-identity';

export type OosComboboxLine = {
  id?: number | string | null;
  sku?: string | null;
  sku_catalog_id?: number | null;
  product_title?: string | null;
  quantity?: string | number | null;
  catalog_image_url?: string | null;
  zoho_item_id?: string | null;
};

export type OosPickerOption = {
  value: string;
  label: string;
  group?: string;
  meta?: string;
  imageUrl?: string | null;
  mono?: boolean;
};

const VALUE_PREFIX = 'oos';

export type ParsedOosComboboxValue = {
  orderRowId: number;
  kind: OrderShortageKind;
  zohoItemId: string | null;
  skuCatalogId: number | null;
  kitPartId: number | null;
  sku: string | null;
  title: string | null;
};

export function encodeOosComboboxValue(args: {
  orderRowId: number;
  kind: OrderShortageKind;
  zohoItemId?: string | null;
  skuCatalogId?: number | null;
  kitPartId?: number | null;
  sku?: string | null;
}): string {
  return [
    VALUE_PREFIX,
    args.orderRowId,
    args.kind,
    args.zohoItemId?.trim() || '-',
    args.skuCatalogId ?? 0,
    args.kitPartId ?? 0,
    encodeURIComponent(args.sku?.trim() || ''),
  ].join(':');
}

export function parseOosComboboxValue(raw: string): ParsedOosComboboxValue | null {
  const parts = String(raw || '').split(':');
  if (parts[0] !== VALUE_PREFIX) return null;
  const orderRowId = Number(parts[1]);
  if (!Number.isFinite(orderRowId) || orderRowId <= 0) return null;
  const kind = parts[2] as OrderShortageKind;
  if (
    kind !== 'listing' &&
    kind !== 'kit_part' &&
    kind !== 'catalog_child' &&
    kind !== 'catalog_other'
  ) {
    return null;
  }
  const zoho = parts[3] && parts[3] !== '-' ? parts[3] : null;
  const skuCatalogId = Number(parts[4]);
  const kitPartId = Number(parts[5]);
  let sku: string | null = null;
  try {
    sku = decodeURIComponent(parts[6] || '') || null;
  } catch {
    sku = parts[6] || null;
  }
  return {
    orderRowId,
    kind,
    zohoItemId: zoho,
    skuCatalogId: Number.isFinite(skuCatalogId) && skuCatalogId > 0 ? skuCatalogId : null,
    kitPartId: Number.isFinite(kitPartId) && kitPartId > 0 ? kitPartId : null,
    sku,
    title: null,
  };
}

export function identityFromParsedOos(
  parsed: ParsedOosComboboxValue,
  extras?: { title?: string | null; qtyShort?: number | null; itemId?: string | null },
): OrderShortageIdentity {
  const base = {
    sku: parsed.sku,
    skuCatalogId: parsed.skuCatalogId,
    title: extras?.title || parsed.title || parsed.sku || 'Item',
    qtyShort: extras?.qtyShort,
    zohoItemId: parsed.zohoItemId,
    itemId: extras?.itemId ?? null,
  };
  if (parsed.kind === 'kit_part') {
    return kitPartShortageIdentity({ ...base, title: base.title, kitPartId: parsed.kitPartId });
  }
  if (parsed.kind === 'catalog_child') {
    return catalogChildShortageIdentity(base);
  }
  if (parsed.kind === 'catalog_other') {
    return catalogOtherShortageIdentity(base);
  }
  return listingShortageIdentity(base);
}

function productLabel(title: string | null | undefined, sku: string | null | undefined, fallback: string): string {
  const name = String(title || '').trim();
  if (name) return name;
  const code = String(sku || '').trim();
  if (code) return code;
  return fallback;
}

/** Options for products already on this commercial order (and kit children). Never line indexes. */
export function oosOptionsOnThisOrder(
  lines: readonly OosComboboxLine[],
  compositionByCatalogId?: ReadonlyMap<number, KitComposition>,
): OosPickerOption[] {
  const options: OosPickerOption[] = [];
  for (const line of lines) {
    const orderRowId = Number(line.id);
    if (!Number.isFinite(orderRowId) || orderRowId <= 0) continue;
    const sku = String(line.sku || '').trim() || null;
    const title = productLabel(line.product_title, sku, 'This listing');
    options.push({
      value: encodeOosComboboxValue({
        orderRowId,
        kind: 'listing',
        zohoItemId: line.zoho_item_id,
        skuCatalogId: line.sku_catalog_id == null ? null : Number(line.sku_catalog_id),
        sku,
      }),
      label: title,
      meta: sku ?? undefined,
      group: 'On this order',
      imageUrl: line.catalog_image_url ?? null,
      mono: false,
    });
    const catalogId = Number(line.sku_catalog_id);
    const composition =
      Number.isFinite(catalogId) && catalogId > 0 ? compositionByCatalogId?.get(catalogId) : null;
    for (const component of composition?.components ?? []) {
      const kind: OrderShortageKind =
        component.source === 'catalog_edge' ? 'catalog_child' : 'kit_part';
      const childSku = String(component.sku || '').trim() || null;
      options.push({
        value: encodeOosComboboxValue({
          orderRowId,
          kind,
          skuCatalogId: component.childSkuCatalogId ?? null,
          kitPartId: component.kitPartId ?? null,
          sku: childSku,
        }),
        label: component.title,
        meta: childSku
          ? `${childSku}${component.qty > 1 ? ` · ×${component.qty}` : ''}`
          : component.qty > 1
            ? `×${component.qty}`
            : undefined,
        group: 'On this order',
        imageUrl: component.thumbUrl,
      });
    }
  }
  return options;
}

export function oosOptionsFromZohoCatalogHits(
  hits: readonly {
    id?: number;
    sku?: string | null;
    product_title?: string | null;
    zoho_item_id?: string | null;
    image_url?: string | null;
  }[],
  bindOrderRowId: number | null,
): OosPickerOption[] {
  if (bindOrderRowId == null || bindOrderRowId <= 0) return [];
  return hits.map((hit) => {
    const zoho = String(hit.zoho_item_id || '').trim();
    const sku = String(hit.sku || '').trim() || null;
    const title = productLabel(hit.product_title, sku, 'Inventory item');
    return {
      value: encodeOosComboboxValue({
        orderRowId: bindOrderRowId,
        kind: 'catalog_other',
        zohoItemId: zoho || null,
        skuCatalogId: hit.id ?? null,
        sku,
      }),
      label: title,
      meta: sku ?? undefined,
      group: 'All inventory',
      imageUrl: hit.image_url ?? null,
    };
  });
}
