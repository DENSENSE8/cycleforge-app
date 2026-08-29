/**
 * FBA shipment-board grid surface descriptor — lifts
 * {@link FBA_BOARD_GRID_COLUMNS} into the TanStack defs `LedgerGridSurface`
 * mounts.
 *
 * `fba-board-capabilities.ts` deferred this with a specific reason: "the board
 * still hand-rolls its track template … authoring a column model here *without*
 * rendering from it would create exactly the stale second declaration
 * `makeGridSurfaceDescriptor`'s own docblock warns about". That reason expired
 * when the board started deriving both its template and its header labels from
 * `FBA_BOARD_GRID_COLUMNS` — the model is now the thing that renders, so a
 * descriptor over it describes what is on screen rather than an aspiration.
 *
 * Row ORDER stays with the board's own comparator; TanStack is state math only.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import { FBA_BOARD_GRID_CAPABILITIES } from '@/components/fba/fba-board-capabilities';
import {
  FBA_BOARD_GRID_COLUMNS,
  isFbaBoardGridSortable,
  type FbaBoardGridColumn,
} from '@/components/fba/fba-board-grid-layout';
import type { FbaBoardItem } from '@/lib/fba/types';

/**
 * The frozen identity prefix — a contiguous leading run, which
 * `table-definition.ts` refuses to accept in any other shape (`gridFrozenLeft`
 * sums the widths of the frozen columns BEFORE a given one, so a gap pins the
 * rest at the wrong origin).
 */
function isFbaBoardGridFrozen(key: string): boolean {
  return key === 'select' || key === 'asin' || key === 'title';
}

/**
 * `due` sorts newest-deadline-first, because the question a board answers is
 * "what is closest to late". Everything else reads better ascending: an ASIN or
 * a title is being LOOKED UP, and a lookup wants alphabetical.
 */
function fbaBoardSortDescFirst(key: string): boolean {
  return key === 'due' || key === 'qty';
}

export function makeFbaBoardGridDescriptor(
  columns: readonly FbaBoardGridColumn[],
): GridSurfaceDescriptor<FbaBoardItem, FbaBoardGridColumn> {
  return makeGridSurfaceDescriptor<FbaBoardItem, FbaBoardGridColumn>(
    'fba.board',
    columns,
    {
      isSortable: isFbaBoardGridSortable,
      sortDescFirst: fbaBoardSortDescFirst,
      isLocked: isFbaBoardGridFrozen,
    },
    FBA_BOARD_GRID_CAPABILITIES,
  );
}

export { FBA_BOARD_GRID_COLUMNS };
