/**
 * Pure retail-catalog helpers (no DB / no server-only).
 * Async loaders live in `sales-catalog.ts`.
 */

import { isRepairSku } from '@/utils/sku';
import type { EcwidCategory, EcwidProduct } from '@/lib/repair/ecwid-repair-catalog';
import {
  resolveRepairCategoryLevelFrom,
  type RepairCategoryLevel,
} from '@/lib/repair/ecwid-repair-catalog';

function asId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/** Keep sellable retail lines — exclude repair-service `-RS` SKUs. */
export function filterRetailProducts(products: EcwidProduct[]): EcwidProduct[] {
  return products
    .filter((product) => !isRepairSku(product.sku))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Storefront category drill that EXCLUDES the repair subtree.
 * Same response shape as the repair category level so ProductSelector is unaware.
 */
export function resolveRetailCategoryLevelFrom(
  categories: EcwidCategory[],
  requestedParentIdRaw: string | null,
): RepairCategoryLevel {
  const repairLevel = resolveRepairCategoryLevelFrom(categories, null);
  const repairRootIds = new Set(
    (repairLevel.roots ?? [])
      .map((r) => asId(r.id))
      .filter((id): id is string => Boolean(id)),
  );

  const byId = new Map<string, EcwidCategory>();
  for (const category of categories) {
    const id = asId(category.id);
    if (id) byId.set(id, category);
  }

  const isUnderRepair = (id: string): boolean => {
    let cursor: string | null = id;
    const seen = new Set<string>();
    while (cursor) {
      if (repairRootIds.has(cursor)) return true;
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = asId(byId.get(cursor)?.parentId);
    }
    return false;
  };

  const topLevel = categories.filter((category) => {
    const id = asId(category.id);
    if (!id || repairRootIds.has(id)) return false;
    const parent = asId(category.parentId);
    return !parent || !byId.has(parent);
  });

  const requestedParentId = asId(requestedParentIdRaw);
  if (requestedParentId && isUnderRepair(requestedParentId)) {
    return {
      roots: [{ id: null, name: 'Catalog' }],
      currentParentId: null,
      breadcrumbs: [],
      categories: topLevel.map((category) => {
        const id = asId(category.id)!;
        const children = categories.filter((c) => asId(c.parentId) === id);
        return {
          id,
          name: String(category.name ?? '').trim() || `Category ${id}`,
          parentId: null,
          hasChildren: children.length > 0,
          isLeaf: children.length === 0,
          depth: 0,
          fullPath: String(category.name ?? '').trim() || id,
        };
      }),
      message: 'Repair categories are not available in Buy / Sell.',
    };
  }

  let currentParentId: string | null = null;
  if (requestedParentId && byId.has(requestedParentId) && !isUnderRepair(requestedParentId)) {
    currentParentId = requestedParentId;
  }

  const childSource = currentParentId
    ? categories.filter((c) => asId(c.parentId) === currentParentId && !isUnderRepair(asId(c.id) ?? ''))
    : topLevel;

  const breadcrumbs: Array<{ id: string; name: string }> = [];
  if (currentParentId) {
    let cursor: string | null = currentParentId;
    const seen = new Set<string>();
    while (cursor && byId.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      const node = byId.get(cursor)!;
      breadcrumbs.unshift({ id: cursor, name: String(node.name ?? '').trim() || cursor });
      cursor = asId(node.parentId);
      if (cursor && repairRootIds.has(cursor)) break;
    }
  }

  return {
    roots: [{ id: null, name: 'Catalog' }],
    currentParentId,
    breadcrumbs,
    categories: childSource.map((category) => {
      const id = asId(category.id)!;
      const children = categories.filter((c) => asId(c.parentId) === id && !isUnderRepair(id));
      return {
        id,
        name: String(category.name ?? '').trim() || `Category ${id}`,
        parentId: asId(category.parentId),
        hasChildren: children.length > 0,
        isLeaf: children.length === 0,
        depth: breadcrumbs.length,
        fullPath: [...breadcrumbs.map((b) => b.name), String(category.name ?? '').trim() || id].join(' > '),
      };
    }),
  };
}
