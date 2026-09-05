/**
 * Shared display-sort vocabulary for Pending (To Ship) + Testing queue headers.
 * Quiet trailing dropdown — View composites (Newest | Deadline), every
 * DATA-column fact (same vocabulary as header click), plus platform /
 * carrier pins. A header-click sort (Pick, Status, …) must appear
 * as a selectable row in this menu — the trigger naming the column is not enough.
 * URL: `?sort=` (omit when `deadline`, the default); `?dir=asc|desc` only for
 * column sorts (omit when the column’s default direction). Legacy `priority`
 * and a missing param both parse as `deadline`.
 */

import { CARRIER_BRANDS, type DisplayCarrier } from '@/lib/carrier-brand';
import { SOURCE_PLATFORMS } from '@/lib/source-platform';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';

export type QueueDisplaySortComposite = 'newest' | 'deadline';

export type QueueDisplaySortColumn =
  | 'title'
  /** Derived days past ship-by (`Nd`). Replaced fused `sla` / civil-date face. */
  | 'age'
  | 'qty'
  | 'order'
  | 'tracking'
  /** Pick step — who picked, blanks last. */
  | 'picked'
  /** Packed step — packer name, blanks last. */
  | 'packed'
  /** Status pill label (queue-mode aware). */
  | 'status'
  /** Sale amount. */
  | 'amount'
  /** Scan-out stamp (`ship_confirmed_at`), blanks last. */
  | 'scanned_out'
  /** Shortage coverage face (`formatShortageCoverage`). */
  | 'coverage'
  /** Carrier A–Z (no pin). A pin is `carrier:<DisplayCarrier label>`. */
  | 'carrier'
  /** Pin one carrier (tracking-ring face). */
  | `carrier:${string}`
  /** Pin one sales platform (Order-column filled dot). */
  | `channel:${string}`;

export type QueueDisplaySort = QueueDisplaySortComposite | QueueDisplaySortColumn;

/** Group heading for header-click DATA facts — Order, Pick, … */
export const QUEUE_COLUMN_SORT_GROUP = 'Columns';

/** Group heading for Order-column marketplace dots — Amazon, eBay, … */
export const QUEUE_CHANNEL_SORT_GROUP = 'Platform';

/** Group heading for the tracking-ring names — USPS, UPS, … */
export const QUEUE_CARRIER_SORT_GROUP = 'Carriers';

export type QueueDisplaySortDir = 'asc' | 'desc';

const QUEUE_COLUMN_SORTS = [
  'title',
  'age',
  'qty',
  'order',
  'tracking',
  'picked',
  'packed',
  'status',
  'amount',
  'scanned_out',
  'coverage',
  'carrier',
] as const;

const COLUMN_SORT_SET = new Set<string>(QUEUE_COLUMN_SORTS);

/**
 * Retired `?sort=` values kept readable so shared/bookmarked links survive.
 * Fused `sla` and civil-date `date` resolve to the live Late (`age`) column.
 * Parse-only — never written back out, so these drain from live URLs on the
 * next sort interaction.
 */
const RETIRED_COLUMN_SORT_ALIASES: Readonly<Record<string, QueueDisplaySortColumn>> = {
  sla: 'age',
  date: 'age',
  // Cond column retired → inline Product tag; bookmarks fall back to product sort.
  condition: 'title',
};

const QUEUE_CARRIER_PIN_LABELS: ReadonlySet<string> = new Set(
  (Object.keys(CARRIER_BRANDS) as DisplayCarrier[])
    .filter((id) => id !== 'Unknown')
    .map((id) => CARRIER_BRANDS[id].label),
);

const QUEUE_CHANNEL_PIN_LABELS: ReadonlySet<string> = new Set(
  SOURCE_PLATFORMS.filter((p) => p.value && p.label && p.label !== 'Other' && p.label !== 'Unknown').map(
    (p) => p.label,
  ),
);

/** `?sort=carrier:USPS` — tracking-ring names, never "USPS first". */
export function isQueueCarrierPinSort(sort: string): sort is `carrier:${string}` {
  if (!sort.startsWith('carrier:')) return false;
  return QUEUE_CARRIER_PIN_LABELS.has(sort.slice('carrier:'.length));
}

/** The pinned carrier face, or null when this is not a carrier pin. */
export function queueCarrierPin(sort: string): string | null {
  if (!isQueueCarrierPinSort(sort)) return null;
  return sort.slice('carrier:'.length);
}

/** `?sort=channel:Amazon` — Order-column filled-dot names. */
export function isQueueChannelPinSort(sort: string): sort is `channel:${string}` {
  if (!sort.startsWith('channel:')) return false;
  return QUEUE_CHANNEL_PIN_LABELS.has(sort.slice('channel:'.length));
}

/** The pinned channel face, or null when this is not a channel pin. */
export function queueChannelPin(sort: string): string | null {
  if (!isQueueChannelPinSort(sort)) return null;
  return sort.slice('channel:'.length);
}

export function isQueueNamePinSort(sort: string): boolean {
  return isQueueCarrierPinSort(sort) || isQueueChannelPinSort(sort);
}

export function isQueueColumnSort(sort: string): sort is QueueDisplaySortColumn {
  return COLUMN_SORT_SET.has(sort) || isQueueNamePinSort(sort);
}

/**
 * COMPOUND track → the `?sort=` value it represents.
 *
 * ## Why this exists
 *
 * When To-Ship moved to the two-row compound row, its header keys changed from
 * the flat facts (`title`, `order`, …) to the compound tracks
 * (`fulfillment`, `item`, …). Nothing updated the sort vocabulary, so
 * `isQueueColumnSort` rejected every header key and **clicking a header
 * silently did nothing** — sorting was simply off on the desk, and stayed off
 * because the e2e that would have caught it was itself still clicking a flat
 * locator that resolved to zero elements.
 *
 * ## Why this is a restoration, not a new decision
 *
 * A compound track is a container for facts the flat model already sorted by:
 * `fulfillment` carries the order identity (`order`), `item` carries the
 * product title (`title`). Mapping them re-connects existing comparators —
 * `queue-row-compare.ts` needs no new case.
 *
 * `select` / `actions` / `_fill` / `thumb` stay unmapped — they are chrome, not facts.
 * Every painted DATA track (`state`, `amount`, and bound `status:N`
 * fields) maps onto a comparator in `queue-row-compare.ts`. `thumb` is chrome.
 */
export const COMPOUND_TRACK_SORT_KEYS: Readonly<Record<string, QueueDisplaySortColumn>> = {
  fulfillment: 'order',
  item: 'title',
  dates: 'age',
  state: 'status',
};

/**
 * Catalog field id → the `?sort=` fact it represents. Slot tracks are keyed
 * `status:N`, so the bound FIELD is what makes a header clickable — a rebind
 * of Pick into `status:2` must still sort as `picked`.
 */
export const SLOT_FIELD_SORT_FACTS: Readonly<Record<string, QueueDisplaySortColumn>> = {
  'orders.picked': 'picked',
  'orders.packed': 'packed',
  'orders.scanned_out': 'scanned_out',
  'orders.qty': 'qty',
  'orders.amount': 'amount',
  'orders.coverage': 'coverage',
};

/** The `?sort=` value a header key drives, or null when it does not sort. */
export function queueSortForColumnKey(
  key: string,
  fieldId?: string | null,
): QueueDisplaySortColumn | null {
  if (isSlotTableChromeTrack(key)) return null;
  if (isQueueColumnSort(key)) return key;
  if (COMPOUND_TRACK_SORT_KEYS[key]) return COMPOUND_TRACK_SORT_KEYS[key];
  if (fieldId && SLOT_FIELD_SORT_FACTS[fieldId]) return SLOT_FIELD_SORT_FACTS[fieldId];
  return null;
}

/** Header keys that sort — the descriptor's `isSortable` for this family. */
export function isQueueSortableColumnKey(key: string, fieldId?: string | null): boolean {
  return queueSortForColumnKey(key, fieldId) != null;
}

function isQueueCompositeSort(sort: string): sort is QueueDisplaySortComposite {
  return sort === 'newest' || sort === 'deadline';
}

/**
 * Default direction when first activating a column sort.
 *
 * `age` defaults to DESC: larger days-late first (most overdue on top).
 * Money and scan-out stamps open newest / highest first. Other fact columns
 * stay ASC. Image/`thumb` is chrome — it does not sort.
 */
export function defaultDirForQueueSort(sort: QueueDisplaySort): QueueDisplaySortDir | null {
  if (!isQueueColumnSort(sort)) return null;
  if (sort === 'age' || sort === 'amount' || sort === 'scanned_out') {
    return 'desc';
  }
  return 'asc';
}

export const QUEUE_DISPLAY_SORT_OPTIONS: readonly {
  id: QueueDisplaySort;
  label: string;
  /** Short label for the chrome sort dropdown trigger. */
  shortLabel: string;
  group: string;
}[] = [
  { id: 'newest', label: 'Newest first', shortLabel: 'Newest', group: 'View' },
  { id: 'deadline', label: 'By ship-by date', shortLabel: 'Deadline', group: 'View' },
] as const;

const QUEUE_COLUMN_SORT_MENU_ORDER: readonly (typeof QUEUE_COLUMN_SORTS)[number][] = [
  'order',
  'title',
  'status',
  'picked',
  'packed',
  'scanned_out',
  'qty',
  'amount',
  'age',
  'tracking',
  'coverage',
  'carrier',
];

if (QUEUE_COLUMN_SORT_MENU_ORDER.length !== QUEUE_COLUMN_SORTS.length) {
  throw new Error('queueColumnSortOptions must list every QUEUE_COLUMN_SORTS fact');
}

/**
 * Closed-control face for the active `?sort=` — including header-click
 * column sorts that are not rows in the dropdown. The trigger must name
 * the exact order (Product, Amazon + filled dot, USPS + ring), never
 * fall back to "Sort, custom".
 */
export type QueueDisplaySortFace = {
  label: string;
  shortLabel: string;
  identity?: { kind: 'platform' | 'carrier'; label: string };
};

const QUEUE_COLUMN_SORT_FACES: Readonly<
  Record<
    | 'title'
    | 'age'
    | 'qty'
    | 'order'
    | 'tracking'
    | 'picked'
    | 'packed'
    | 'status'
    | 'amount'
    | 'scanned_out'
    | 'coverage'
    | 'carrier',
    QueueDisplaySortFace
  >
> = {
  title: { label: 'Product title', shortLabel: 'Product' },
  age: { label: 'Days late', shortLabel: 'Days late' },
  qty: { label: 'Quantity', shortLabel: 'Qty' },
  order: { label: 'Order number', shortLabel: 'Order' },
  tracking: { label: 'Tracking number', shortLabel: 'Tracking' },
  picked: { label: 'Pick', shortLabel: 'Pick' },
  packed: { label: 'Packer', shortLabel: 'Packer' },
  status: { label: 'Status', shortLabel: 'Status' },
  amount: { label: 'Amount', shortLabel: 'Amount' },
  scanned_out: { label: 'Scanned out', shortLabel: 'Scanned out' },
  coverage: { label: 'Coverage', shortLabel: 'Coverage' },
  carrier: { label: 'Carrier', shortLabel: 'Carrier' },
};

/**
 * DATA-column facts for the toolbar sort list — same ids as header click / `?sort=`.
 * View composites and platform/carrier pins stay in their own bands.
 */
export function queueColumnSortOptions(): readonly {
  id: (typeof QUEUE_COLUMN_SORTS)[number];
  label: string;
  shortLabel: string;
  group: typeof QUEUE_COLUMN_SORT_GROUP;
}[] {
  return QUEUE_COLUMN_SORT_MENU_ORDER.map((id) => {
    const face = QUEUE_COLUMN_SORT_FACES[id];
    return {
      id,
      label: face.label,
      shortLabel: face.shortLabel,
      group: QUEUE_COLUMN_SORT_GROUP,
    };
  });
}

/** Exact trigger paint for the active sort, whether or not it is in the menu. */
export function queueDisplaySortFace(sort: QueueDisplaySort): QueueDisplaySortFace {
  const fromMenu = QUEUE_DISPLAY_SORT_OPTIONS.find((o) => o.id === sort);
  if (fromMenu) return { label: fromMenu.label, shortLabel: fromMenu.shortLabel };
  const channel = queueChannelPin(sort);
  if (channel) {
    return { label: channel, shortLabel: channel, identity: { kind: 'platform', label: channel } };
  }
  const carrier = queueCarrierPin(sort);
  if (carrier) {
    return { label: carrier, shortLabel: carrier, identity: { kind: 'carrier', label: carrier } };
  }
  return QUEUE_COLUMN_SORT_FACES[sort as keyof typeof QUEUE_COLUMN_SORT_FACES] ?? {
    label: sort,
    shortLabel: sort,
  };
}

/**
 * Order-column filled-dot names — the SAME labels the identity chip paints
 * (`SOURCE_PLATFORMS`), A–Z, Other/Unknown omitted. Amazon + FBA share one
 * face. A pick pins that platform to the top; it does not hide the others.
 */
export function queueChannelSortOptions(): readonly {
  id: `channel:${string}`;
  label: string;
  shortLabel: string;
  group: typeof QUEUE_CHANNEL_SORT_GROUP;
  identity: { kind: 'platform'; label: string };
}[] {
  return [...QUEUE_CHANNEL_PIN_LABELS]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((label) => ({
      id: `channel:${label}` as const,
      label,
      shortLabel: label,
      group: QUEUE_CHANNEL_SORT_GROUP,
      identity: { kind: 'platform' as const, label },
    }));
}

/**
 * Carrier faces for the sort menu — the SAME labels the tracking chip paints
 * (`CARRIER_BRANDS`), A–Z, Unknown omitted. A pick pins that name to the top
 * of the queue; it does not hide the others and it does not invent a rank
 * label like "USPS first".
 */
export function queueCarrierSortOptions(): readonly {
  id: `carrier:${string}`;
  label: string;
  shortLabel: string;
  group: typeof QUEUE_CARRIER_SORT_GROUP;
  identity: { kind: 'carrier'; label: string };
}[] {
  return (Object.keys(CARRIER_BRANDS) as DisplayCarrier[])
    .filter((id) => id !== 'Unknown')
    .map((id) => CARRIER_BRANDS[id].label)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((label) => ({
      id: `carrier:${label}` as const,
      label,
      shortLabel: label,
      group: QUEUE_CARRIER_SORT_GROUP,
      identity: { kind: 'carrier' as const, label },
    }));
}

export function parseQueueDisplaySort(raw: string | null | undefined): QueueDisplaySort {
  // Amazon is both a channel (Order dot) and a carrier (tracking ring). The
  // operator's Amazon sort is the Order column — rewrite the old carrier pin
  // BEFORE the generic carrier: recognizer so it cannot stick as logistics.
  if (raw === 'carrier:Amazon') return 'channel:Amazon';
  // Retired synonym of ship-by — same job, dropped from the menu.
  if (raw === 'priority') return 'deadline';
  if (raw === 'image') return 'deadline';
  if (raw && isQueueCompositeSort(raw)) return raw;
  if (raw && isQueueColumnSort(raw)) return raw;
  if (raw && RETIRED_COLUMN_SORT_ALIASES[raw]) return RETIRED_COLUMN_SORT_ALIASES[raw];
  return 'deadline';
}

/**
 * Resolve `?dir=` for the active sort. Composites have no direction (null).
 * Unknown / missing dir → column default.
 */
export function parseQueueDisplaySortDir(
  raw: string | null | undefined,
  sort: QueueDisplaySort,
): QueueDisplaySortDir | null {
  if (!isQueueColumnSort(sort)) return null;
  if (raw === 'asc' || raw === 'desc') return raw;
  return defaultDirForQueueSort(sort);
}

/** Write `?sort=` / `?dir=` — delete defaults so URLs stay clean. */
export function applyQueueDisplaySortParam(
  params: URLSearchParams,
  sort: QueueDisplaySort,
  dir?: QueueDisplaySortDir | null,
): void {
  if (sort === 'deadline') params.delete('sort');
  else params.set('sort', sort);

  if (isQueueColumnSort(sort)) {
    const resolved = dir ?? defaultDirForQueueSort(sort)!;
    const def = defaultDirForQueueSort(sort)!;
    if (resolved === def) params.delete('dir');
    else params.set('dir', resolved);
  } else {
    params.delete('dir');
  }
}

/** Flip ASC ↔ DESC. */
export function flipQueueDisplaySortDir(dir: QueueDisplaySortDir): QueueDisplaySortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}
