/**
 * `search.hits` — the `/search` find plane's table definition, capabilities
 * and surface descriptor.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`SEARCH_HITS_COMPOUND_COLUMNS`), never a hand array.
 */

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

/**
 * A READ plane. `/search` is a FIND surface — "query is the object, the hit is
 * a confirmation, work happens on the handoff" — so
 * there is no verb here and `multiSelect` stays off: the gutter checkbox would
 * be a control with no verb behind it, and a find plane that could mutate six
 * entity families at once is the second engine this law exists to refuse.
 *
 * Read-only is a TIER, not an exemption: the plane still gets header sort, the
 * one search box and the Fields picker, because every other mount does.
 */
export const SEARCH_HITS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
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
  /**
   * The HANDOFF, which is the only write path a FIND surface has. Picking a
   * row writes `?sel=<entity>:<id>` on this same route and the page swaps the
   * browse plane for that record's dossier — a URL commit, so `navigate` is
   * the honest arm rather than a panel stacked over a table that is no longer
   * on screen.
   *
   * This is a read plane's first sanctioned action verbatim: hand
   * off to the desk that owns the family. The second (invoke a declared verb)
   * has nothing to invoke here, because a find plane declares none.
   */
  recordPlane: {
    kind: 'navigate',
    reason:
      'A picked hit writes ?sel=<entity>:<id> on /search and the page opens that record dossier — the handoff a FIND surface exists for, never an edit on the result list.',
  },
};
