import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid/grid-surface-descriptor';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { CatalogLinkGridColumn } from './catalog-link-grid-layout';

/**
 * Listing match is a QUEUE, not a checklist:
 *
 * `multiSelect: false` — a click opens the catalog-link rail. There is no
 * bulk-link; one listing is one catalog SKU.
 *
 * `inCellEdit: false` — linking backfills every matching order. That is the
 * record plane, not a cell.
 */
export const CATALOG_LINK_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeCatalogLinkGridDescriptor(
  visible: readonly CatalogLinkGridColumn[],
): GridSurfaceDescriptor<CatalogLinkChoreRow, CatalogLinkGridColumn> {
  return makeGridSurfaceDescriptor<CatalogLinkChoreRow, CatalogLinkGridColumn>(
    'review.catalog-link',
    visible,
    undefined,
    CATALOG_LINK_GRID_CAPABILITIES,
  );
}
