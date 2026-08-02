/**
 * Review · Catalog link grid surface descriptors — lifts the two house column
 * SoTs into the TanStack defs `LedgerGridSurface` mounts. Sorting stays inside
 * each tab's own vocabulary; row ORDER stays with the house comparators in
 * {@link ReviewCatalogLinkGridView} (TanStack owns state math only).
 *
 * **Two column models, ONE capabilities bag.** The tabs differ in what their
 * columns MEAN, not in what the surface may do: both are read maps that open a
 * record, neither has a bulk plane, neither edits in place. A second bag would
 * be two declarations of one answer, and the first one to drift would do it
 * silently.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import {
  defaultDirForCatalogLinkGridSort,
  isCatalogLinkGridFrozen,
  isCatalogLinkGridSortable,
  type CatalogLinkGridColumn,
} from './catalog-link-grid-layout';
import {
  defaultDirForImportExceptionGridSort,
  isImportExceptionGridFrozen,
  isImportExceptionGridSortable,
  type ImportExceptionGridColumn,
} from './import-exception-grid-layout';

/**
 * Review · Catalog link browse — pick a row, resolve it at the record plane.
 *
 * Every flag is a decision, not a default:
 *  • `rowTriageFlags` — triage wash is outbound dispatch vocabulary (Orders
 *    only). A chore's urgency is already legible in its `orders` count; a second
 *    colour story on top would be chrome inventing a fact (Kinetic Ledger law 1).
 *  • `multiSelect` — nothing here acts on N rows at once. Linking a listing is a
 *    per-record judgement (which catalog SKU is *this* one?), and a gutter with
 *    no wiring behind it is the inert gutter the workbench law bans.
 *  • `inCellEdit` — **the load-bearing one.** Tab B's Item Number looks like a
 *    textbook single-value in-cell field, but resolving it re-runs the sheet →
 *    order import path and **creates an order**
 *    (`order-import-exceptions.ts`). Side-effectful multi-step work is the
 *    RECORD plane (`display/workbench.md` → Action planes), which is why the
 *    form lives in the right rail and not in a cell popover.
 *  • `dayBands` — these are open queues ordered by attention, not a civil-day log.
 *
 * `fieldsMenu` is on: both models carry `hideKey`s + `tier`s, both `TableId`s
 * have a `TABLE_COLUMNS` entry, and `GridFieldsMenu` mounts in the chrome's
 * `WorkbenchTrailingCluster`. All of that landed together — a flag without the
 * menu is a claim on a staff-preference surface that does not exist.
 */
export const CATALOG_LINK_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the chore descriptor from a RESOLVED column list (post-visibility). */
export function makeCatalogLinkGridDescriptor(
  columns: readonly CatalogLinkGridColumn[],
): GridSurfaceDescriptor<CatalogLinkChoreRow, CatalogLinkGridColumn> {
  return makeGridSurfaceDescriptor<CatalogLinkChoreRow, CatalogLinkGridColumn>(
    'review.catalog-link',
    columns,
    {
      isSortable: isCatalogLinkGridSortable,
      sortDescFirst: (key) => defaultDirForCatalogLinkGridSort(key) === 'desc',
      isLocked: isCatalogLinkGridFrozen,
    },
    CATALOG_LINK_GRID_CAPABILITIES,
  );
}

/** Build the exception descriptor from a RESOLVED column list (post-visibility). */
export function makeImportExceptionGridDescriptor(
  columns: readonly ImportExceptionGridColumn[],
): GridSurfaceDescriptor<ImportExceptionRow, ImportExceptionGridColumn> {
  return makeGridSurfaceDescriptor<ImportExceptionRow, ImportExceptionGridColumn>(
    'review.missing-item-number',
    columns,
    {
      isSortable: isImportExceptionGridSortable,
      sortDescFirst: (key) => defaultDirForImportExceptionGridSort(key) === 'desc',
      isLocked: isImportExceptionGridFrozen,
    },
    CATALOG_LINK_GRID_CAPABILITIES,
  );
}

// No pre-built canonical descriptors: each column set is resolved per staffer by
// `useGridColumnVisibility`, so the view always builds from the RESOLVED list
// (which keeps `contentMinWidthRem` and the CSS grid template honest when a
// track is hidden).
