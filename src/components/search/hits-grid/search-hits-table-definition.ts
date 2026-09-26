/** `search.hits` — the `/search` find plane's table definition, capabilities and surface descriptor. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  SEARCH_HITS_COMPOUND_COLUMNS,
  defaultDirForSearchHitsColumn,
  isSearchHitsColumnSortable,
  type SearchHitsGridColumn,
} from './search-hits-grid-layout';

/** A READ plane. */
export const SEARCH_HITS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
export function makeSearchHitsGridDescriptor(
  columns: readonly SearchHitsGridColumn[],
): GridSurfaceDescriptor<AiSearchHit, SearchHitsGridColumn> {
  return makeGridSurfaceDescriptor<AiSearchHit, SearchHitsGridColumn>(
    'search.hits',
    columns,
    {
      isSortable: (key) => isSearchHitsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForSearchHitsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    SEARCH_HITS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const SEARCH_HITS_TABLE_DEFINITION = parseTableDefinition({
  id: 'search.hits',
  tableId: 'search-hits',
  entityFamily: 'search-hits',
  cellMapKey: 'search-hits',
  ariaLabel: 'Search results',
  testId: 'search-index',
  surface: 'sheet',
  // A relevance-ranked list is not chronological, so a sticky day band would
  // cut the ranking into groups that mean nothing. The stamp is still a
  // sortable column; grouping by it is not the default reading.
  showDayHeaders: false,
  capabilities: SEARCH_HITS_GRID_CAPABILITIES,
  columns: SEARCH_HITS_COMPOUND_COLUMNS,
});

export const SEARCH_HITS_TABLE_BINDING: TableSurfaceBinding<
  AiSearchHit,
  SearchHitsGridColumn
> = {
  definition: SEARCH_HITS_TABLE_DEFINITION,
  columns: SEARCH_HITS_COMPOUND_COLUMNS,
  makeDescriptor: makeSearchHitsGridDescriptor,
  /** The HANDOFF, which is the only write path a FIND surface has. */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A picked hit writes ?sel=<entity>:<id> on /search and the page opens that record dossier — the handoff a FIND surface exists for, never an edit on the result list.',
  },
};
