/**
 * search-tabs — category group vocabulary + preview grouping for Dashboard
 * Search results and the header dropdown preview. (No UI pill strip — groups
 * are section headers only.)
 */

import type { AiSearchHit } from '@/lib/search/ai-search-client';

/** Entity groups for the results surface (section headers). */
export const CATEGORY_TABS = [
  { id: 'all', label: 'Overview' },
  { id: 'order', label: 'Orders' },
  { id: 'unit', label: 'Units' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'sku', label: 'SKUs' },
  { id: 'repair', label: 'Repairs' },
  { id: 'fba', label: 'FBA' },
] as const;

// ── Header-preview grouping ─────────────────────────────────────────────────

/** UI entity type → group heading (orders first). */
const PREVIEW_ENTITY_ORDER = ['order', 'unit', 'receiving', 'sku', 'repair', 'fba'] as const;
const ENTITY_GROUP_LABEL: Record<string, string> = {
  order: 'Orders',
  unit: 'Units',
  receiving: 'Receiving',
  sku: 'SKUs',
  repair: 'Repairs',
  fba: 'FBA',
};

export interface PreviewGroup {
  label: string;
  hits: AiSearchHit[];
}

/**
 * Group flat retrieval hits for the compact header preview: orders first, at
 * most `perGroup` rows per entity, at most `total` rows overall. The flat
 * display order (groups concatenated) is what the combobox keyboard nav walks.
 */
export function groupHitsForPreview(
  hits: AiSearchHit[],
  { perGroup = 2, total = 8 }: { perGroup?: number; total?: number } = {},
): PreviewGroup[] {
  const byType = new Map<string, AiSearchHit[]>();
  for (const hit of hits) {
    const bucket = byType.get(hit.entityType);
    if (bucket) bucket.push(hit);
    else byType.set(hit.entityType, [hit]);
  }
  const groups: PreviewGroup[] = [];
  let used = 0;
  const seen = new Set<string>();
  for (const type of PREVIEW_ENTITY_ORDER) {
    const bucket = byType.get(type);
    seen.add(type);
    if (!bucket?.length || used >= total) continue;
    const take = bucket.slice(0, Math.min(perGroup, total - used));
    if (take.length) {
      groups.push({ label: ENTITY_GROUP_LABEL[type] ?? type, hits: take });
      used += take.length;
    }
  }
  // Any entity type not in the canonical order (defensive) trails last.
  for (const [type, bucket] of byType) {
    if (seen.has(type) || used >= total) continue;
    const take = bucket.slice(0, Math.min(perGroup, total - used));
    if (take.length) {
      groups.push({ label: ENTITY_GROUP_LABEL[type] ?? type, hits: take });
      used += take.length;
    }
  }
  return groups;
}

/** The flat hit list matching the grouped display order (for keyboard nav). */
export function flattenPreviewGroups(groups: PreviewGroup[]): AiSearchHit[] {
  return groups.flatMap((g) => g.hits);
}
