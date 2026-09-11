/**
 * Multi-tenant kit / bundle composition for order OOS (Shopify-like).
 *
 * Three systems exist in this repo — do NOT confuse them:
 *
 * 1. Zoho `-P` SKU grammar (`parsePartSku`) — USAV dogfood convention on the
 *    Zoho `items` mirror. NOT multi-tenant. Never use it to decide what is
 *    short on an order.
 * 2. `sku_kit_parts` — packing "what's in the box" checklist (component names).
 * 3. `sku_relationships` — org-scoped parent→child catalog edges (the sellable
 *    bundle graph). Prefer this for OOS identity — same idea as Shopify
 *    `productComponents` (parent listing + linked component products + qty).
 *
 * Importers: MorphingRowActionMenu, GET /api/sku-catalog/[id]/composition,
 * batch composition load → CompoundItem kitFace, Products BundleComponentsStrip.
 * Schema: reads sku_relationships + sku_kit_parts; never Zoho `-P`.
 * User: multi-tenant parent→child kit display like Shopify bundles on order tables.
 */

export type KitCompositionSource = 'catalog_edge' | 'kit_part';

export type KitCompositionParent = {
  skuCatalogId: number;
  sku: string | null;
  title: string | null;
  thumbUrl: string | null;
};

/** One contained product / part — Shopify "Bundled products" row. */
export type KitCompositionComponent = {
  source: KitCompositionSource;
  /** Stable key for React lists. */
  key: string;
  title: string;
  sku: string | null;
  qty: number;
  thumbUrl: string | null;
  /** Present when source is catalog_edge. */
  childSkuCatalogId?: number | null;
  relationshipId?: number | null;
  /** Present when source is kit_part. */
  kitPartId?: number | null;
  componentType?: string | null;
};

export type KitComposition = {
  parent: KitCompositionParent;
  components: KitCompositionComponent[];
};

export type CatalogChildInput = {
  relationship_id: number;
  qty: number;
  sku_id: number;
  sku: string;
  product_title: string;
  image_url?: string | null;
};

export type KitPartInput = {
  id: number;
  component_name: string;
  component_type?: string;
  qty_required?: number;
};

/**
 * Prefer catalog edges (tenant pairs). Fall back to packing kit_parts names.
 * Never invents rows from Zoho `-P` SKU parsing.
 */
export function mergeKitComposition(args: {
  parent: KitCompositionParent;
  children?: readonly CatalogChildInput[] | null;
  kitParts?: readonly KitPartInput[] | null;
}): KitComposition {
  const children = args.children ?? [];
  if (children.length > 0) {
    return {
      parent: args.parent,
      components: children.map((child) => ({
        source: 'catalog_edge' as const,
        key: `edge:${child.relationship_id}`,
        title: String(child.product_title || child.sku || 'Component').trim(),
        sku: String(child.sku || '').trim() || null,
        qty: Number.isFinite(child.qty) && child.qty > 0 ? child.qty : 1,
        thumbUrl: String(child.image_url || '').trim() || null,
        childSkuCatalogId: child.sku_id,
        relationshipId: child.relationship_id,
      })),
    };
  }

  const parts = args.kitParts ?? [];
  return {
    parent: args.parent,
    components: parts.map((part) => ({
      source: 'kit_part' as const,
      key: `kit:${part.id}`,
      title: String(part.component_name || 'Part').trim(),
      sku: null,
      qty:
        Number.isFinite(part.qty_required) && (part.qty_required as number) > 0
          ? (part.qty_required as number)
          : 1,
      thumbUrl: null,
      kitPartId: part.id,
      componentType: part.component_type ?? 'PART',
    })),
  };
}

export function kitCompositionHasComponents(composition: KitComposition): boolean {
  return composition.components.length > 0;
}

/** Slim Item-cell face — parent title stays; this is the Bundle/Kit chip + hover. */
export type KitFace = {
  /** e.g. `Bundle · 3` or `Kit · 2` */
  label: string;
  source: KitCompositionSource;
  components: readonly {
    key: string;
    title: string;
    sku: string | null;
    qty: number;
    thumbUrl: string | null;
  }[];
};

export function kitFaceFromComposition(composition: KitComposition | null | undefined): KitFace | null {
  if (!composition || !kitCompositionHasComponents(composition)) return null;
  const source = composition.components[0]!.source;
  const n = composition.components.length;
  const kind = source === 'catalog_edge' ? 'Bundle' : 'Kit';
  return {
    label: `${kind} · ${n}`,
    source,
    components: composition.components.map((c) => ({
      key: c.key,
      title: c.title,
      sku: c.sku,
      qty: c.qty,
      thumbUrl: c.thumbUrl,
    })),
  };
}

/** API / queue payload key for which store won the merge. */
export function kitCompositionSourceLabel(
  composition: KitComposition,
): 'sku_relationships' | 'sku_kit_parts' | 'none' {
  if (composition.components.length === 0) return 'none';
  return composition.components[0]!.source === 'catalog_edge'
    ? 'sku_relationships'
    : 'sku_kit_parts';
}
