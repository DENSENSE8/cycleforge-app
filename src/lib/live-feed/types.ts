/** The Live feed payloads (`/operations/live-feed`: `GET /api/live-feed`, `/board`, `/tracking`). Client-safe types only. */

import type {
  LiveFeedChannel,
  LiveFeedDirection,
  LiveFeedLens,
  LiveFeedSection,
  LiveFeedStatusId,
  LiveFeedStatusKind,
} from '@/lib/live-feed/statuses';

export type {
  LiveFeedChannel,
  LiveFeedDirection,
  LiveFeedLens,
  LiveFeedSection,
  LiveFeedStatusId,
} from '@/lib/live-feed/statuses';

/** The URL filters, normalized (`readLiveFeedFilters`). */
export interface LiveFeedFilters {
  dir: LiveFeedDirection;
  /** API only: ONE lane, always of `dir` and of `channel`; null = the Board (every lane of `dir`, one column each). */
  status: LiveFeedStatusId | null;
  /** Online or in person; null = both. */
  channel: LiveFeedChannel | null;
  /** Staff id — narrows a staff-attributed lane to that person. */
  staff: number | null;
  /** Which instant the range reads (`Date by`); `entered` = when the package entered its current lane. */
  lens: LiveFeedLens;
  /**
   * Warehouse (America/Los_Angeles) civil days, `YYYY-MM-DD`, `from <= to`.
   * Always set — the range always applies (default: today).
   */
  from: string;
  to: string;
  /** `HH:mm` warehouse wall clock; narrows `from`'s start / `to`'s end. */
  timeFrom: string | null;
  timeTo: string | null;
  /** Upper-cased carrier token as stored (`UPS`, `FEDEX`, `UNKNOWN`); narrows carrier lanes only. */
  carrier: string | null;
  /** Tracking / order number / SKU / PO. */
  q: string | null;
  /** Open lanes under lens `entered` also list what entered them before `from` and is still there. */
  carry: boolean;
  /** API only: 1-based server page of one lane (the Board ignores it). */
  page: number;
}

/** Filters naming one lane — the lane page, its Copy all. */
export type LiveFeedStatusFilters = LiveFeedFilters & { status: LiveFeedStatusId };

export type LiveFeedUrgency = 'late' | 'due_today' | 'aging';

/**
 * Why an item reads differently from its lane-mates: `noCarrierScan` — a
 * tracked package scanned out a day ago or more with no carrier scan;
 * `pickup` — a counter-pickup order the customer collects (no carrier).
 */
export const LIVE_FEED_ITEM_FLAGS = ['noCarrierScan', 'pickup'] as const;
export type LiveFeedItemFlag = (typeof LIVE_FEED_ITEM_FLAGS)[number];

export interface LiveFeedLine {
  title: string;
  photoUrl: string | null;
  condition: string | null;
  qty: number | null;
  price: string | null;
}

/** An outbound package's stage instants (ISO) read from the membership's own rows; null = not reached (or not on those rows). */
export interface LiveFeedTrail {
  packedAt: string | null;
  scannedOutAt: string | null;
  carrierAt: string | null;
  deliveredAt: string | null;
}

export interface LiveFeedItem {
  /** Unique within its direction: a package is in one lane. */
  key: string;
  statusId: LiveFeedStatusId;
  direction: LiveFeedDirection;
  channel: LiveFeedChannel;
  /** When the record entered its current lane, ISO. */
  at: string | null;
  staffId: number | null;
  staffName: string | null;
  tracking: string | null;
  carrier: string | null;
  /** Marketplace / Square order number of the record's lead order line. */
  orderId: string | null;
  poNumber: string | null;
  /**
   * The in-person record's own handle when it has no tracking / order / PO to
   * speak for it: `Visit 42` (counter visit), `Pickup 12` (local pickup),
   * `Square sale` — else null.
   */
  ref: string | null;
  /** In person: the customer on the record (counter visit, Square sale, local pickup seller). */
  customer: string | null;
  shipmentId: number | null;
  receivingId: number | null;
  /** Why the record is in its lane beyond the lane itself (`Part paid` on a part-paid counter visit). */
  reason: string | null;
  urgency: LiveFeedUrgency | null;
  /**
   * Sub-kind: `staged` on Packed, `out_for_delivery` / `stalled` in transit,
   * `unlinked` on a pack scan no shipment answers to; in person the record
   * family: `COUNTER` (visit), `SQUARE` (Square sale), `LOCAL_PICKUP` (local
   * pickup), `PICKUP_ORDER` (counter-pickup order).
   */
  sub: string | null;
  flags: LiveFeedItemFlag[];
  line: LiveFeedLine | null;
  /** Outbound packages: the stage trail (Packed → Scanned out → With carrier → Delivered); absent on other items. */
  trail?: LiveFeedTrail;
  /** The record's page, or null when it has none. */
  href: string | null;
}

/** A lane as the payloads describe it. */
export interface LiveFeedStatusFace {
  id: LiveFeedStatusId;
  label: string;
  /** The long definition (tooltip). */
  hint: string;
  kind: LiveFeedStatusKind;
  section: LiveFeedSection;
  staffLabel: string | null;
  channels: readonly LiveFeedChannel[];
}

/** One of a column's top groups: a carrier (carrier lanes) or a staffer (staff lanes). */
export interface LiveFeedGroup {
  /** Carrier token (`USPS`, `UNKNOWN`) or staff id as text (`'unassigned'` for none). */
  key: string;
  label: string;
  count: number;
}

/** `GET /api/live-feed` — one lane, one server page (a Board column's expand past its cap). */
export interface LiveFeedPage {
  filters: LiveFeedStatusFilters;
  status: LiveFeedStatusFace & {
    /** False when the lane's state cannot have had the lens event (count 0, no items). */
    applicable: boolean;
    /** Exact count under the filters (0 when `staff` is set on a lane that attributes nobody). */
    count: number;
  };
  items: LiveFeedItem[];
  page: number;
  pageSize: number;
}

/**
 * One Board column: a lane, its exact count, its late / oldest facts, its top
 * groups, and its first {@link LIVE_FEED_BOARD_COLUMN_CAP} items (late first).
 */
export interface LiveFeedBoardColumn {
  status: LiveFeedStatusFace;
  /** False when the lane's state cannot have had the lens event: count 0, no items — the UI mutes it. */
  applicable: boolean;
  /** Items listed under the range (and, with `carry`, the carried-over ones). */
  count: number;
  /** Items marked late or aging (exact, under the same filters). */
  lateCount: number;
  /** Open lanes: the oldest listed item's `at` (ISO); done lanes: null. */
  oldestAt: string | null;
  /** Open lanes only: items still in the lane that entered it before `from` (lens `entered`; else 0). */
  carriedOver?: number;
  /** Done lanes only: the same lens's count over the previous period of equal length. */
  previousCount?: number;
  /** Top {@link LIVE_FEED_BOARD_GROUP_CAP} groups by count: by carrier on carrier lanes, else by staff. */
  groups: LiveFeedGroup[];
  /** How many more groups exist past `groups`. */
  groupsMore: number;
  items: LiveFeedItem[];
}

/** `GET /api/live-feed/board` — every lane of `dir` (and of `channel`), in pipeline order. */
export interface LiveFeedBoard {
  filters: LiveFeedFilters & { status: null };
  columns: LiveFeedBoardColumn[];
}

/** `GET /api/live-feed/tracking` — every tracking number of the lane, deduped, in list order, unpaged. */
export interface LiveFeedTracking {
  status: LiveFeedStatusId;
  /** The lane's exact count (records, not distinct tracking numbers). */
  count: number;
  tracking: string[];
}
