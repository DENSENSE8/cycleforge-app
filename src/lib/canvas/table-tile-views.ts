/**
 * The table tiles' **view vocabulary** — which named views each registered
 * binding offers, what each is called, and how a tab titles itself.
 *
 * ## Why this is its own module and not a field on the binding
 *
 * The tile REGISTRY (`@/lib/canvas/table-tiles`) has to answer `title(tab)`
 * synchronously, before anything is loaded — that is what puts a name on a
 * suspended tab's chrome. It therefore cannot import the bindings: every
 * `*-table-definition` reaches `@/design-system/components/grid`, and that
 * barrel re-exports `LedgerGrid` / `LedgerGridSurface` / `LedgerDrillHost`.
 * A registry that eagerly pulled the grid engine into the shell chunk would
 * hand back the ~1MB-gz per-route chunking win the registry exists to protect —
 * the tile bodies would still be lazy and the saving would be gone anyway.
 *
 * So the names live here, in a module that reaches nothing heavier than the
 * workspace types, a date formatter and the param codec — the only grid import
 * anywhere in the chain is `table-tab-params`' `import type
 * { LedgerGridColumnModel }`, which erases at compile time and pulls no runtime
 * module. BOTH sides read them: the registry for the tab title, and each tile for
 * its own `ariaLabel`. One vocabulary, two readers — rather than a literal
 * typed once in the registry and again in the tile, which is how a tab strip
 * and a screen reader end up disagreeing about which grid is on screen.
 *
 * The base names mirror each definition's `ariaLabel` deliberately. They are
 * the same fact; they cannot be the same STRING without the import above.
 */

import type { TabParams } from '@/lib/workspace/types';
import { getCurrentPSTDateKey, parseDateKey } from '@/utils/date';
import { TABLE_TAB_PARAM, readTabEnum, readTabEnumOrNull, readTabString } from './table-tab-params';

/** Every registered binding's definition id, as a tab `ref`. */
export const TABLE_TILE_REFS = {
  receiving: 'receiving.browse',
  incoming: 'inbound.incoming',
  ordersDefault: 'fulfillment.default',
  ordersTested: 'fulfillment.tested',
  daily: 'home.daily',
  tasks: 'tasks.mine',
} as const;

export type TableTileRef = (typeof TABLE_TILE_REFS)[keyof typeof TABLE_TILE_REFS];

// ── receiving.browse ────────────────────────────────────────────────────────

export const RECEIVING_TILE_VIEWS = ['queue', 'recent', 'history'] as const;
export type ReceivingTileView = (typeof RECEIVING_TILE_VIEWS)[number];

export function readReceivingTileView(params: TabParams): ReceivingTileView {
  return readTabEnum<ReceivingTileView>(
    params,
    TABLE_TAB_PARAM.view,
    RECEIVING_TILE_VIEWS,
    'queue',
  );
}

export function receivingTileViewLabel(view: ReceivingTileView): string {
  return view === 'queue' ? 'Queue' : view === 'recent' ? 'Recent' : 'History';
}

// ── inbound.incoming ────────────────────────────────────────────────────────

/**
 * The delivery-state facet. Not a "view" in the sense the other families use —
 * Incoming has one column model; the facet changes WHICH cartons, and for the
 * two `DELIVERED_*` values which endpoint feeds them.
 */
export const INCOMING_TILE_STATES = [
  'DELIVERED_UNOPENED',
  'DELIVERED_NOT_UNBOXED',
  'ARRIVING_TODAY',
  'STALLED',
  'IN_TRANSIT',
  'TRACKING_UNAVAILABLE',
  'PENDING_CARRIER',
  'CARRIER_MISMATCH',
  'AWAITING_TRACKING',
  'WRONG_DESTINATION',
] as const;
export type IncomingTileState = (typeof INCOMING_TILE_STATES)[number];

export function readIncomingTileState(params: TabParams): IncomingTileState | null {
  return readTabEnumOrNull(params, TABLE_TAB_PARAM.state, INCOMING_TILE_STATES);
}

export function incomingTileStateLabel(state: IncomingTileState | null): string {
  if (!state) return 'All';
  return state
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ── fulfillment.default / fulfillment.tested ────────────────────────────────

export const ORDERS_TILE_REFS = [
  TABLE_TILE_REFS.ordersDefault,
  TABLE_TILE_REFS.ordersTested,
] as const;
export type OrdersTileRef = (typeof ORDERS_TILE_REFS)[number];

export function parseOrdersTileRef(ref: string): OrdersTileRef {
  return ref === TABLE_TILE_REFS.ordersTested
    ? TABLE_TILE_REFS.ordersTested
    : TABLE_TILE_REFS.ordersDefault;
}

/** The server-side stage facet this tab is scoped to. */
export const ORDERS_TILE_VIEWS = ['all', 'pending', 'tested'] as const;
export type OrdersTileView = (typeof ORDERS_TILE_VIEWS)[number];

/**
 * A tested-COLUMNS tab defaults to the TESTED lane: opening the tester +
 * tested-at layout over the whole backlog paints two empty tracks on most rows,
 * which reads as a broken grid rather than as a wide filter. A default-columns
 * tab defaults to the whole queue, which is what "Outbound orders" means.
 */
export function readOrdersTileView(params: TabParams, ref: OrdersTileRef): OrdersTileView {
  const raw = readTabString(params, TABLE_TAB_PARAM.view);
  if ((ORDERS_TILE_VIEWS as readonly string[]).includes(raw)) return raw as OrdersTileView;
  return ref === TABLE_TILE_REFS.ordersTested ? 'tested' : 'all';
}

export function ordersTileViewLabel(view: OrdersTileView): string {
  return view === 'pending' ? 'Pending' : view === 'tested' ? 'Tested' : 'All';
}

// ── home.daily ──────────────────────────────────────────────────────────────

export const DAILY_TILE_VIEWS = ['open', 'done', 'all'] as const;
export type DailyTileView = (typeof DAILY_TILE_VIEWS)[number];

export function readDailyTileView(params: TabParams): DailyTileView {
  return readTabEnum<DailyTileView>(params, TABLE_TAB_PARAM.view, DAILY_TILE_VIEWS, 'open');
}

/**
 * The civil day this tab holds. A junk / retired key resolves to today rather
 * than to an empty report — a tab restored from an older build must still paint
 * a checklist.
 */
export function readDailyTileDate(params: TabParams): string {
  const raw = readTabString(params, TABLE_TAB_PARAM.date);
  return raw && parseDateKey(raw) ? raw : getCurrentPSTDateKey();
}

export function dailyTileViewLabel(view: DailyTileView): string {
  return view === 'done' ? 'Done' : view === 'all' ? 'All' : 'Open';
}

// ── tasks.mine ──────────────────────────────────────────────────────────────

export const TASKS_TILE_VIEWS = ['open', 'done', 'deleted'] as const;
export type TasksTileView = (typeof TASKS_TILE_VIEWS)[number];

export function readTasksTileView(params: TabParams): TasksTileView {
  return readTabEnum<TasksTileView>(params, TABLE_TAB_PARAM.view, TASKS_TILE_VIEWS, 'open');
}

export function tasksTileViewLabel(view: TasksTileView): string {
  return view === 'done' ? 'Done' : view === 'deleted' ? 'Deleted' : 'Open';
}

// ── titles ──────────────────────────────────────────────────────────────────

/** The base name of each table — its definition's `ariaLabel`. */
const TABLE_TILE_NAME: Record<TableTileRef, string> = {
  [TABLE_TILE_REFS.receiving]: 'Receiving',
  [TABLE_TILE_REFS.incoming]: 'Incoming',
  [TABLE_TILE_REFS.ordersDefault]: 'Orders',
  [TABLE_TILE_REFS.ordersTested]: 'Orders — tested',
  [TABLE_TILE_REFS.daily]: 'Daily',
  [TABLE_TILE_REFS.tasks]: 'My tasks',
};

/**
 * A tab's chrome label: the table's name, plus the VIEW identity wherever one
 * table can be open twice on two different views.
 *
 * The view half is not decoration. Two tabs of Receiving both titled
 * "Receiving" make the tab strip unusable at exactly the moment the tab strip
 * is earning its keep — the operator opened a second one BECAUSE they wanted
 * two views at once. Orders' two refs already say which layout they are, so
 * their second half names the lane instead.
 */
export function tableTileTitle(ref: string, params: TabParams): string {
  switch (ref) {
    case TABLE_TILE_REFS.receiving:
      return `Receiving · ${receivingTileViewLabel(readReceivingTileView(params))}`;
    case TABLE_TILE_REFS.incoming:
      return `Incoming · ${incomingTileStateLabel(readIncomingTileState(params))}`;
    case TABLE_TILE_REFS.ordersDefault:
    case TABLE_TILE_REFS.ordersTested: {
      const orderRef = parseOrdersTileRef(ref);
      const label = ordersTileViewLabel(readOrdersTileView(params, orderRef));
      return `${TABLE_TILE_NAME[orderRef]} · ${label}`;
    }
    case TABLE_TILE_REFS.daily: {
      const date = readDailyTileDate(params);
      const when = date === getCurrentPSTDateKey() ? 'Today' : date;
      return `Daily · ${when}`;
    }
    case TABLE_TILE_REFS.tasks:
      return `My tasks · ${tasksTileViewLabel(readTasksTileView(params))}`;
    default:
      // An honest, greppable identifier beats a friendly name for a ref this
      // module does not know — the tile body says the same thing.
      return ref;
  }
}
