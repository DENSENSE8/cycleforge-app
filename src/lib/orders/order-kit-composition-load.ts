/** Server batch loader for Shopify-like kit faces on order desks. */

import { getGraphNodes, getChildrenForParents } from '@/lib/neon/sku-relationship-queries';
import { getKitPartsForCatalogIds } from '@/lib/neon/sku-catalog-queries';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  mergeKitComposition,
  kitCompositionSourceLabel,
  type KitComposition,
} from '@/lib/orders/order-kit-composition';

const BATCH_CAP = 100;

export function normalizeCompositionCatalogIds(ids: readonly unknown[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of ids) {
    const id = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= BATCH_CAP) break;
  }
  return out;
}

export async function loadKitCompositionsByCatalogIds(
  catalogIds: readonly number[],
  orgId: OrgId,
): Promise<Map<number, KitComposition>> {
  const ids = normalizeCompositionCatalogIds(catalogIds);
  const out = new Map<number, KitComposition>();
  if (ids.length === 0) return out;

  const [nodes, childrenByParent, partsByParent] = await Promise.all([
    getGraphNodes(ids, orgId),
    getChildrenForParents(ids, orgId),
    getKitPartsForCatalogIds(ids, orgId),
  ]);

  const nodeById = new Map(nodes.map((n) => [n.sku_id, n]));

  for (const id of ids) {
    const node = nodeById.get(id);
    const children = childrenByParent.get(id) ?? [];
    const parts = partsByParent.get(id) ?? [];
    const composition = mergeKitComposition({
      parent: {
        skuCatalogId: id,
        sku: node ? String(node.sku || '').trim() || null : null,
        title: node ? String(node.product_title || '').trim() || null : null,
        thumbUrl: node ? String(node.image_url || '').trim() || null : null,
      },
      children: children.map((c) => ({
        relationship_id: c.relationship_id,
        qty: c.qty,
        sku_id: c.sku_id,
        sku: c.sku,
        product_title: c.product_title,
        image_url: c.image_url,
      })),
      kitParts: parts.map((p) => ({
        id: p.id,
        component_name: p.component_name,
        component_type: p.component_type,
        qty_required: p.qty_required,
      })),
    });
    out.set(id, composition);
  }

  return out;
}

export function compositionsToApiPayload(map: Map<number, KitComposition>): Record<
  string,
  { composition: KitComposition; source: ReturnType<typeof kitCompositionSourceLabel> }
> {
  const byId: Record<
    string,
    { composition: KitComposition; source: ReturnType<typeof kitCompositionSourceLabel> }
  > = {};
  for (const [id, composition] of map) {
    byId[String(id)] = {
      composition,
      source: kitCompositionSourceLabel(composition),
    };
  }
  return byId;
}
