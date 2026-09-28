/**
 * View specs — layer 4 of the screen order (`docs/design-system/HANDOFF-view-spec-layers.md`):
 * WHY this person is looking. One entry per page × saved view, keyed
 * `'<page>.<view>'`. A spec only CHOOSES and ORDERS: facts come from the field
 * catalog, record sections from `OrderRecordSectionId`, verbs from
 * `ORDER_VERB_IDS`. It never defines a fact, a style or a component, and it
 * knows no tokens — presentation reads it, never the other way round.
 */

import type { OrdersFactId } from '@/lib/tables/field-catalog/orders';
import type { OrderRecordSectionId } from '@/lib/selection-context/order-inspector-context';
import type { OrderVerbId } from '@/lib/orders/order-verbs';

/** Row density, sparse → dense (the ledger's row zoom). */
export type Density = 'S' | 'M' | 'L';

/** Every density, in toolbar order. */
export const DENSITIES: readonly Density[] = ['S', 'M', 'L'];

/**
 * The first density a row fact paints at: `rest` every density, `label` from
 * M, `detail` from L, `open` only in the open record.
 */
export type DisclosureTier = 'rest' | 'label' | 'detail' | 'open';

/** How a list view orders its rows — each id names one existing ordering. */
export type ViewSort =
  /** Ship-by soonest (the queue's `deadline` sort; the staffer may re-sort). */
  | 'ship-by'
  /** Missing item number first, then the most orders one pairing releases (`sortExceptionQueueRows`). */
  | 'hold-release';

/** What a view that only opens records (no list of its own) declares. */
export interface RecordViewSpec<SectionId extends string, VerbId extends string> {
  /** The one question this view answers — also the empty / all-clear copy source. */
  job: string;
  /** Record sections, in paint order. */
  record: readonly SectionId[];
  /** ONE primary verb, then secondary verbs; hotkeys come from the verb builder. */
  verbs: { primary: VerbId; secondary: readonly VerbId[]; bulk: readonly VerbId[] };
}

/** A list view: the record spec plus what its rows lead with, show and sort by. */
export interface ViewSpec<FactId extends string, SectionId extends string, VerbId extends string>
  extends RecordViewSpec<SectionId, VerbId> {
  /** The fact that orders the list and colours the row (field-catalog id). */
  lead: FactId;
  /** Row facts in priority order, each with the disclosure tier it first paints at. */
  rowFacts: readonly { fact: FactId; tier: DisclosureTier }[];
  /** Default + allowed densities for this view (the staffer picks within the range). */
  density: { default: Density; allowed: readonly Density[] };
  sort: ViewSort;
  /** All-clear state for this job. */
  empty: { title: string; detail: string };
}

/** Order views that paint a list of order lines (the outbound ledger / cards). */
export const ORDER_LIST_VIEW_KEYS = ['shipping.to-ship', 'shipping.pending', 'shipping.exceptions'] as const;
export type OrderListViewKey = (typeof ORDER_LIST_VIEW_KEYS)[number];

/** Order views that only open one order's record. */
export type OrderRecordViewKey = 'shipping.shipped' | 'search.orders';

/** Every view an order record opens on. */
export type OrderViewKey = OrderListViewKey | OrderRecordViewKey;

/**
 * What a view may never paint — listing it in its `record` is a type error
 * (owner 2026-09-25: the pairing form is the Exceptions desk's job alone;
 * label history is the archive's and the lookup's).
 */
interface OrderRecordForbiddenSections {
  'shipping.to-ship': 'label-entries' | 'resolve';
  'shipping.pending': 'label-entries' | 'resolve';
  'shipping.exceptions': 'label-entries';
  'shipping.shipped': 'resolve' | 'assign';
  'search.orders': 'resolve';
}

type SectionsFor<K extends OrderViewKey> = Exclude<OrderRecordSectionId, OrderRecordForbiddenSections[K]>;

type OrderViewSpecs = {
  readonly [K in OrderViewKey]: K extends OrderListViewKey
    ? ViewSpec<OrdersFactId, SectionsFor<K>, OrderVerbId>
    : RecordViewSpec<SectionsFor<K>, OrderVerbId>;
};

/**
 * The work queue's row — shared by To ship and Pending (same desk, different
 * lock). Qty · condition · price (owner 2026-09-28: no stock, item # or bin on
 * the list — the open record carries them).
 */
const WORK_QUEUE_ROW = [
  { fact: 'orders.fulfill_by', tier: 'rest' },
  { fact: 'orders.condition', tier: 'rest' },
  { fact: 'orders.qty', tier: 'rest' },
  { fact: 'orders.amount', tier: 'rest' },
  { fact: 'orders.picked', tier: 'rest' },
  { fact: 'orders.packed', tier: 'rest' },
  { fact: 'orders.customer', tier: 'label' },
] as const satisfies ViewSpec<OrdersFactId, string, string>['rowFacts'];

const WORK_QUEUE_RECORD = [
  'state',
  'buyer-note',
  'item',
  'stages',
  'assign',
  'timeline',
  'price',
  'note',
  'customer',
  'facts',
] as const;

const WORK_QUEUE_VERBS = {
  primary: 'label',
  secondary: ['scan-out', 'out-of-stock', 'urgent', 'notes', 'create-rule'],
  bulk: ['urgent', 'print', 'out-of-stock'],
} as const;

export const VIEW_SPECS: OrderViewSpecs = {
  'shipping.to-ship': {
    job: 'What do I pick / pack next, and by when?',
    lead: 'orders.fulfill_by',
    rowFacts: WORK_QUEUE_ROW,
    density: { default: 'M', allowed: DENSITIES },
    sort: 'ship-by',
    record: WORK_QUEUE_RECORD,
    verbs: WORK_QUEUE_VERBS,
    empty: { title: 'No orders to ship', detail: 'Queue clear' },
  },
  'shipping.pending': {
    job: 'Which blocked orders can move again, and by when?',
    lead: 'orders.fulfill_by',
    rowFacts: WORK_QUEUE_ROW,
    density: { default: 'M', allowed: DENSITIES },
    sort: 'ship-by',
    record: WORK_QUEUE_RECORD,
    verbs: WORK_QUEUE_VERBS,
    empty: { title: 'No pending orders', detail: 'Nothing is blocked' },
  },
  'shipping.exceptions': {
    job: 'Why is this order held, and what releases it?',
    lead: 'orders.hold_reason',
    rowFacts: [
      { fact: 'orders.hold_reason', tier: 'rest' },
      { fact: 'orders.hold_fix', tier: 'rest' },
      { fact: 'orders.hold_releases', tier: 'rest' },
      { fact: 'orders.qty', tier: 'rest' },
      { fact: 'orders.customer', tier: 'label' },
      { fact: 'orders.item_number', tier: 'label' },
    ],
    // A held order is read, not worked with the hands — no sparse floor size.
    density: { default: 'M', allowed: ['S', 'M'] },
    sort: 'hold-release',
    // The pairing form (`resolve`) leads the main column. Its notes field
    // carries the routing text (`exceptionRowToQueueRow`), so the note editor
    // and the price stay off.
    record: ['state', 'buyer-note', 'resolve', 'item', 'stages', 'assign', 'timeline', 'customer', 'facts'],
    verbs: {
      primary: 'resolve',
      secondary: ['paste', 'out-of-stock', 'urgent', 'notes', 'create-rule'],
      bulk: ['urgent', 'out-of-stock'],
    },
    empty: { title: 'No held orders', detail: 'Every caged order is paired' },
  },
  // The shipped archive: what left, who handled each step, where it is now.
  'shipping.shipped': {
    job: 'What left, who handled it, and where is it now?',
    record: [
      'state',
      'buyer-note',
      'item',
      'stages',
      'shipment',
      'label-entries',
      'documents',
      'timeline',
      'customer',
      'facts',
      'price',
      'note',
      'conversation',
    ],
    verbs: {
      primary: 'label',
      secondary: ['scan-out', 'notes', 'print-slip', 'return-label', 'replacement-label'],
      bulk: ['print'],
    },
  },
  // The on-the-phone lookup: returns and replacements are why the caller rang.
  'search.orders': {
    job: 'What happened to this order, and what does the caller need?',
    record: [
      'state',
      'buyer-note',
      'item',
      'stages',
      'assign',
      'shipment',
      'label-entries',
      'timeline',
      'customer',
      'facts',
      'price',
      'note',
    ],
    verbs: {
      primary: 'return-label',
      secondary: ['replacement-label', 'label', 'scan-out', 'out-of-stock', 'urgent', 'notes', 'create-rule'],
      bulk: ['urgent', 'print'],
    },
  },
};

/** Is `key` a view that paints a list of order lines? */
export function isOrderListView(key: OrderViewKey): key is OrderListViewKey {
  return 'rowFacts' in VIEW_SPECS[key];
}

/** Does the view offer this verb at all (primary, secondary or bulk)? */
export function viewOffersVerb(key: OrderViewKey, verb: OrderVerbId): boolean {
  const { verbs } = VIEW_SPECS[key];
  return verbs.primary === verb || verbs.secondary.includes(verb) || verbs.bulk.includes(verb);
}

/** The view's row facts that paint at this density, in priority order. */
export function rowFactsAt(key: OrderListViewKey, density: Density): readonly OrdersFactId[] {
  const reach: Record<Density, readonly DisclosureTier[]> = {
    S: ['rest'],
    M: ['rest', 'label'],
    L: ['rest', 'label', 'detail'],
  };
  return VIEW_SPECS[key].rowFacts.filter((f) => reach[density].includes(f.tier)).map((f) => f.fact);
}

/** Clamp a stored density into the view's allowed range (unknown → the view's default). */
export function viewDensity(key: OrderListViewKey, stored: unknown): Density {
  const { density } = VIEW_SPECS[key];
  return density.allowed.includes(stored as Density) ? (stored as Density) : density.default;
}
