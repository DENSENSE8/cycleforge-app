/**
 * The desk label catalog on Inventory › Locations › Labels: one tile per
 * printable warehouse sticker, opened in place with `?kind=`.
 */

import { inventoryLocationsHref } from '@/lib/inventory/locations-path';

export type LabelCatalogKind = 'location' | 'tote';

export interface LabelCatalogEntry {
  title: string;
  /** What the sticker goes on, in one line. */
  summary: string;
}

/** Tile order on the grid: Location codes left, Totes right. */
export const LABEL_CATALOG_KINDS: readonly LabelCatalogKind[] = ['location', 'tote'];

export const LABEL_CATALOG: Record<LabelCatalogKind, LabelCatalogEntry> = {
  location: { title: 'Location codes', summary: 'Zone, aisle, bay, level and an optional position.' },
  tote: { title: 'Totes', summary: 'H- plates: mint a new run or reprint one tote.' },
};

export function parseLabelCatalogKind(raw: string | null | undefined): LabelCatalogKind | null {
  return raw && (LABEL_CATALOG_KINDS as readonly string[]).includes(raw) ? (raw as LabelCatalogKind) : null;
}

/** `/inventory/locations?tab=labels[&kind=…]` — the grid, or one label's printer. */
export function labelCatalogHref(kind: LabelCatalogKind | null): string {
  return inventoryLocationsHref({ tab: 'labels', extra: { kind } });
}

/**
 * Where a retired Locations tab now lives: `?tab=totes` is the Totes tile; a
 * plain `?tab=bays` (bay labels are location codes now) is Location codes. A
 * bay WITH a code keeps its rack detail view (null = stay).
 */
export function legacyLabelTabTarget(tab: string | null, code: string | null): string | null {
  if (tab === 'totes') return labelCatalogHref('tote');
  if ((tab === 'bays' || tab === 'racks') && !code) return labelCatalogHref('location');
  return null;
}
