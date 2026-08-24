'use client';

/**
 * Table canvas tiles — one descriptor per registered table binding.
 *
 * Before this module, every `table` tab rendered
 * `No tile registered for table · <ref>`. The honest gap was correct: a binding
 * carries the column model and the descriptor factory but **not the fetch**, so
 * a wildcard `table/*` would have mounted an empty grid and turned "not ported
 * yet" into "broken". This registers the six bindings that DO have a fetch, one
 * exact `ref` at a time — which is exactly the shape the registry was built for
 * ("an exact `ref` always beats a wildcard, so specialisations can land one at a
 * time with no ordering rule to remember").
 *
 * ## `ref` is the DEFINITION id, not the `TableId`
 *
 * A tab's `ref` is "what this tab is a handle on", and for a table that has to
 * be the thing that identifies the GRID: `TableId` is the per-staff prefs
 * bucket, and it is not unique — `fulfillment.default` and `fulfillment.tested`
 * are two different DEFINITIONS (descriptor factory, test id, aria name, default
 * lane) that deliberately share the `orders` bucket. The visible TRACKS are the
 * same on both: the tile mounts `ORDERS_COMPOUND_COLUMNS`, which is
 * mode-independent, exactly as `useOrdersSpreadsheet` does for the route — so a
 * tab titled "Orders — tested" opens on the tested lane rather than repainting
 * into a tester + tested-at layout.
 * Keying tiles on `TableId` would have made those two indistinguishable at the
 * one place the distinction matters. `<family>.<view>` is already the registry's
 * enumeration key (`TABLE_DEFINITIONS`), it is already unique, and it is already
 * greppable.
 *
 * ## Why `title` does not read the binding
 *
 * `title(tab)` runs synchronously for every open tab, including suspended ones,
 * so it must not pull anything heavy. Every `*-table-definition` module reaches
 * `@/design-system/components/grid`, whose barrel re-exports `LedgerGrid` and
 * `LedgerGridSurface` — importing a binding here would drag the grid engine
 * into the shell chunk and hand back the ~1MB-gz chunking win this registry
 * exists to protect. The names therefore live in
 * `@/lib/canvas/table-tile-views`, a module with no
 * runtime dependency on the grid, which the TILES read too so the tab strip and
 * the screen reader cannot disagree.
 *
 * ## What is not registered, and why
 *
 * Testing History mounts `receiving.browse` under the `testing` prefs bucket but
 * off a different FEED (`TESTING_RECEIVING_LINES_API`, delivered as flat day
 * sections rather than PO groups). It is a fourth data source, not a fourth
 * view of this one, so it gets its own descriptor when someone ports that feed
 * — not a branch inside the receiving tile.
 */

import { registerCanvasTile } from '@/lib/canvas/tile-registry';
import {
  TABLE_TILE_REFS,
  tableTileTitle,
} from '@/lib/canvas/table-tile-views';

/**
 * Register every table tile.
 *
 * Idempotent: `registerCanvasTile` replaces by `(kind, ref)`, so calling this
 * twice (a hot reload, a second host mount) leaves the registry in exactly the
 * state one call would.
 *
 * Every `load` is a dynamic `import()` — that is the contract that keeps each
 * grid family on its own chunk until a tile actually mounts it. The two Orders
 * refs share one module on purpose: they differ only in column mode, the tile
 * reads it off `tabRef`, and two entries pointing at one `import()` is one
 * chunk rather than two copies of the outbound queue.
 */
export function registerTableCanvasTiles(): void {
  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.receiving,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/ReceivingTableTile'),
  });

  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.incoming,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/IncomingTableTile'),
  });

  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.ordersDefault,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/OrdersTableTile'),
  });

  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.ordersTested,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/OrdersTableTile'),
  });

  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.daily,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/DailyTableTile'),
  });

  registerCanvasTile({
    kind: 'table',
    ref: TABLE_TILE_REFS.tasks,
    title: (tab) => tableTileTitle(tab.ref, tab.params),
    load: () => import('@/components/workspace/canvas/tiles/table/TasksTableTile'),
  });
}
