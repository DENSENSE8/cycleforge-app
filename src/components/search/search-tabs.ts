/**
 * search-tabs — preview grouping for the header dropdown combobox.
 * The full `/search` surface is a flat RRF list (no entity section cards).
 */

import type { AiSearchHit } from '@/lib/search/ai-search-client';

// ── Header-preview grouping ─────────────────────────────────────────────────

/** UI entity type → group heading (orders first). */
const PREVIEW_ENTITY_ORDER = ['order', 'exception', 'unit', 'receiving', 'sku', 'repair', 'fba'] as const;
const ENTITY_GROUP_LABEL: Record<string, string> = {
  order: 'Orders',
  exception: 'Exceptions',
  unit: 'Units',
  receiving: 'Receiving',
  sku: 'SKUs',
  repair: 'Repairs',
  fba: 'FBA',
};

function previewBucket(entityType: string): string {
  if (entityType === 'import_exception') return 'exception';
  return entityType;
}

/** Sentence-case plural name of an entity type ("Orders", "SKUs") — group headings and the palette's type pills. */
export function previewEntityLabel(entityType: string): string {
  const type = previewBucket(entityType);
  const label = ENTITY_GROUP_LABEL[type];
  if (label) return label;
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface PreviewGroup {
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
    const type = previewBucket(hit.entityType);
    const bucket = byType.get(type);
    if (bucket) bucket.push(hit);
    else byType.set(type, [hit]);
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
