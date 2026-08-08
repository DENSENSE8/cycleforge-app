/**
 * Review · Catalog-link table definitions (plan Phase 1, wave 4).
 *
 * The first surface with **TWO definitions under ONE capabilities bag** — the
 * two Review tabs differ in what their columns MEAN (a listing that needs a
 * catalog link vs a sheet row missing an item number), not in what the surface
 * may do. So `CATALOG_LINK_GRID_CAPABILITIES` is shared by reference across both
 * bindings, exactly as `grid-surface-capabilities.guard.test.ts` already asserts
 * for the two `make*Descriptor` factories.
 *
 * `inCellEdit: false` is the load-bearing flag on this surface and rides through
 * untouched: resolving tab B's Item Number re-runs the sheet import and CREATES
 * an order, so it is record-plane work — an order-creating write must never sit
 * one keystroke away in a grid cell.
 */

import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  CATALOG_LINK_GRID_COLUMNS,
  CATALOG_LINK_TABLE_ID,
  type CatalogLinkGridColumn,
} from './catalog-link-grid-layout';
import {
  IMPORT_EXCEPTION_GRID_COLUMNS,
  IMPORT_EXCEPTION_TABLE_ID,
  type ImportExceptionGridColumn,
} from './import-exception-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  CATALOG_LINK_GRID_CAPABILITIES,
  makeCatalogLinkGridDescriptor,
  makeImportExceptionGridDescriptor,
} from './catalog-link-grid-descriptor';

export const CATALOG_LINK_TABLE_DEFINITION = parseTableDefinition({
  id: 'review.catalog-link',
  tableId: CATALOG_LINK_TABLE_ID,
  entityFamily: 'catalog-link',
  cellMapKey: 'catalog-link',
  ariaLabel: 'Listings needing a catalog link',
  testId: 'catalog-link-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: CATALOG_LINK_GRID_CAPABILITIES,
  columns: CATALOG_LINK_GRID_COLUMNS,
});

export const CATALOG_LINK_TABLE_BINDING: TableSurfaceBinding<
  CatalogLinkChoreRow,
  CatalogLinkGridColumn
> = {
  definition: CATALOG_LINK_TABLE_DEFINITION,
  columns: CATALOG_LINK_GRID_COLUMNS,
  makeDescriptor: makeCatalogLinkGridDescriptor,
};

export const IMPORT_EXCEPTION_TABLE_DEFINITION = parseTableDefinition({
  id: 'review.missing-item-number',
  tableId: IMPORT_EXCEPTION_TABLE_ID,
  entityFamily: 'catalog-link',
  cellMapKey: 'catalog-link',
  ariaLabel: 'Sheet rows missing an item number',
  testId: 'import-exception-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  // SAME bag as the sibling tab, by reference — one surface, one declaration.
  capabilities: CATALOG_LINK_GRID_CAPABILITIES,
  columns: IMPORT_EXCEPTION_GRID_COLUMNS,
});

export const IMPORT_EXCEPTION_TABLE_BINDING: TableSurfaceBinding<
  ImportExceptionRow,
  ImportExceptionGridColumn
> = {
  definition: IMPORT_EXCEPTION_TABLE_DEFINITION,
  columns: IMPORT_EXCEPTION_GRID_COLUMNS,
  makeDescriptor: makeImportExceptionGridDescriptor,
};
