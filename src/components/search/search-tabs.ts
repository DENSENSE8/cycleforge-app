/**
 * search-tabs — the shared category-tab vocabulary + preview grouping for the
 * one results surface (Dashboard Search + header dropdown preview).
 */

import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { SearchEntityType } from '@/lib/search/build-search-text';

export interface CategoryTab {
  id: string;
  label: string;
  /** DB entity type for the scoped retrieve; absent = Overview (all). */
  db?: SearchEntityType;
}

export const CATEGORY_TABS = [
  { id: 'all', label: 'Overview' },
  { id: 'order', label: 'Orders', db: 'ORDER' },
  { id: 'unit', label: 'Units', db: 'SERIAL_UNIT' },
  { id: 'receiving', label: 'Receiving', db: 'RECEIVING' },
  { id: 'sku', label: 'SKUs', db: 'SKU' },
  { id: 'repair', label: 'Repairs', db: 'REPAIR' },
  { id: 'fba', label: 'FBA', db: 'FBA_SHIPMENT' },
] as const satisfies readonly CategoryTab[];

export type TabId = (typeof CATEGORY_TABS)[number]['id'];

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_TABS.map((t) => [t.id, t.label]),
);

export function isTabId(value: string): value is TabId {
  return CATEGORY_TABS.some((t) => t.id === value);
}

/** DB entity type for a tab id (undefined for Overview / unknown). */
export function tabDbType(id: TabId): SearchEntityType | undefined {
  const tab = CATEGORY_TABS.find((t) => t.id === id);
  return tab && 'db' in tab ? tab.db : undefined;
}

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
