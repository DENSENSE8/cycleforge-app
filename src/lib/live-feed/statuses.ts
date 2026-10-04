/**
 * The Live feed's lane registry (`/operations/live-feed`) — per direction,
 * the pipeline in order, ONLINE (carrier packages) and IN-PERSON (counter
 * pickups, walk-in sales, local pickups) together. Pure and client-safe: the
 * loader, the APIs, the facets, the board and the sidebar all read it. Ids
 * are dot-free.
 *
 * Every package sits in exactly ONE lane — its CURRENT state (operator
 * 2026-10-03); the lane predicates are mutually exclusive along the pipeline.
 * `open` lanes hold what is still in that state; `done` lanes the end of the
 * line. The date range always applies, read through the LENS (`Date by`):
 * `entered` (the instant the package entered its current lane) or a pipeline
 * event (`packed`, `scanned_out`, `delivered` outbound; `received`, `unboxed`
 * inbound). A lane whose state cannot have had the lens event is not
 * applicable under it (`lenses`). `staffLabel` names the person a lane
 * attributes a record to (null = nobody, so a staff-scoped feed shows it
 * empty); `channels` the channels its rows can belong to; `carrier` lanes
 * read the Carrier facet. `section` groups the board: `work` (open queues a
 * person clears), `moving` (open, out of our hands), `done`. Exceptions are
 * not lanes — they live in the Exceptions hub (`/exceptions`).
 */

import { displayCarrierFromHint } from '@/lib/carrier-brand';

export type LiveFeedDirection = 'outbound' | 'inbound';
export type LiveFeedStatusKind = 'open' | 'done';
/** The board section a lane's column sits under. */
export type LiveFeedSection = 'work' | 'moving' | 'done';
/** What a board column's top groups tally: the row's carrier or its staffer. */
export type LiveFeedGroupBy = 'carrier' | 'staff';

/** How the business met the customer: a carrier package (online) or across the counter / at the curb (in person). */
export const LIVE_FEED_CHANNELS = ['online', 'in_person'] as const;
export type LiveFeedChannel = (typeof LIVE_FEED_CHANNELS)[number];
export const LIVE_FEED_CHANNEL_LABEL: Readonly<Record<LiveFeedChannel, string>> = {
  online: 'Online',
  in_person: 'In person',
};

export function isLiveFeedChannel(raw: string): raw is LiveFeedChannel {
  return (LIVE_FEED_CHANNELS as readonly string[]).includes(raw);
}

/** The `Date by` lens: which instant of a package the date range reads. */
export const LIVE_FEED_LENSES = ['entered', 'packed', 'scanned_out', 'delivered', 'received', 'unboxed'] as const;
export type LiveFeedLens = (typeof LIVE_FEED_LENSES)[number];
export const LIVE_FEED_DEFAULT_LENS: LiveFeedLens = 'entered';
export const LIVE_FEED_LENS_LABEL: Readonly<Record<LiveFeedLens, string>> = {
  entered: 'Entered lane',
  packed: 'Packed',
  scanned_out: 'Scanned out',
  delivered: 'Delivered',
  received: 'Received',
  unboxed: 'Unboxed',
};
const DIRECTION_LENSES: Readonly<Record<LiveFeedDirection, readonly LiveFeedLens[]>> = {
  outbound: ['entered', 'packed', 'scanned_out', 'delivered'],
  inbound: ['entered', 'received', 'unboxed'],
};

export function isLiveFeedLens(raw: string): raw is LiveFeedLens {
  return (LIVE_FEED_LENSES as readonly string[]).includes(raw);
}

/** The lenses a direction offers, `entered` first. */
export function liveFeedLensesOf(direction: LiveFeedDirection): readonly LiveFeedLens[] {
  return DIRECTION_LENSES[direction];
}

export const LIVE_FEED_STATUS_IDS = [
  'out-to-pack',
  'out-packed',
  'out-scanned-out',
  'out-in-transit',
  'out-delivered',
  'out-sold-in-person',
  'in-pickup-to-collect',
  'in-delivered-unscanned',
  'in-docked',
  'in-transit',
  'in-unboxed',
] as const;
export type LiveFeedStatusId = (typeof LIVE_FEED_STATUS_IDS)[number];

export interface LiveFeedStatusSpec {
  id: LiveFeedStatusId;
  direction: LiveFeedDirection;
  /** The board column's one-line name (fits 280px). */
  label: string;
  /** The long definition — what the lane answers, for the column header's tooltip. */
  hint: string;
  kind: LiveFeedStatusKind;
  section: LiveFeedSection;
  /** Who a record in this lane is attributed to; null = no staff on this lane. */
  staffLabel: string | null;
  /** The channels its rows can belong to; `?channel=` outside them hides the lane. */
  channels: readonly LiveFeedChannel[];
  /** Reads the Carrier facet (`?carrier=` narrows it); other lanes ignore the pick. */
  carrier: boolean;
  /** The board column's top groups: by carrier (the package moves with a carrier) or by staffer (a person did the work). */
  groupBy: LiveFeedGroupBy;
  /** The lenses whose event a package in this lane can have had (`entered` always). */
  lenses: readonly LiveFeedLens[];
}

const ONLINE: readonly LiveFeedChannel[] = ['online'];
const IN_PERSON: readonly LiveFeedChannel[] = ['in_person'];
const BOTH: readonly LiveFeedChannel[] = ['online', 'in_person'];

export const LIVE_FEED_STATUSES: readonly LiveFeedStatusSpec[] = [
  {
    id: 'out-to-pack',
    direction: 'outbound',
    label: 'To pack',
    hint: 'Labelled orders and counter-pickup orders still in the building with no pack scan (order grain)',
    kind: 'open',
    section: 'work',
    staffLabel: 'Assigned to',
    channels: BOTH,
    carrier: true,
    groupBy: 'staff',
    lenses: ['entered'],
  },
  {
    id: 'out-packed',
    direction: 'outbound',
    label: 'Packed',
    hint: 'Packed (or staged) and still in the building — not scanned out, no carrier scan; counter-pickup orders waiting for their customer are tagged Pickup',
    kind: 'open',
    section: 'work',
    staffLabel: 'Packed by',
    channels: BOTH,
    carrier: true,
    groupBy: 'staff',
    lenses: ['entered', 'packed'],
  },
  {
    id: 'out-scanned-out',
    direction: 'outbound',
    label: 'Scanned out',
    hint: "Scanned out at the dock and the carrier hasn't moved it — terminal for untracked carriers (USPS); a tracked package with no carrier scan a day after scan-out is flagged",
    kind: 'open',
    section: 'moving',
    staffLabel: 'Scanned out by',
    channels: ONLINE,
    carrier: true,
    groupBy: 'carrier',
    lenses: ['entered', 'packed', 'scanned_out'],
  },
  {
    id: 'out-in-transit',
    direction: 'outbound',
    label: 'In transit',
    hint: 'The carrier has it and has not delivered it',
    kind: 'open',
    section: 'moving',
    staffLabel: 'Scanned out by',
    channels: ONLINE,
    carrier: true,
    groupBy: 'carrier',
    lenses: ['entered', 'packed', 'scanned_out'],
  },
  {
    id: 'out-delivered',
    direction: 'outbound',
    label: 'Delivered',
    hint: 'The carrier delivered it',
    kind: 'done',
    section: 'done',
    staffLabel: 'Scanned out by',
    channels: ONLINE,
    carrier: true,
    groupBy: 'carrier',
    lenses: ['entered', 'packed', 'scanned_out', 'delivered'],
  },
  {
    id: 'out-sold-in-person',
    direction: 'outbound',
    label: 'Sold in person',
    hint: 'Counter visits paid (or part-paid), and Square walk-in sales not tied to a visit',
    kind: 'done',
    section: 'done',
    staffLabel: 'Sold by',
    channels: IN_PERSON,
    carrier: false,
    groupBy: 'staff',
    lenses: ['entered'],
  },
  {
    id: 'in-pickup-to-collect',
    direction: 'inbound',
    label: 'To collect',
    hint: 'Local pickups (purchases we collect in person) not yet done, by pickup date',
    kind: 'open',
    section: 'work',
    staffLabel: 'Keyed by',
    channels: IN_PERSON,
    carrier: false,
    groupBy: 'staff',
    lenses: ['entered'],
  },
  {
    id: 'in-delivered-unscanned',
    direction: 'inbound',
    label: 'At door',
    hint: 'Delivered, not scanned — the carrier delivered it in the last 14 days and nobody has scanned it at the dock',
    kind: 'open',
    section: 'work',
    staffLabel: null,
    channels: ONLINE,
    carrier: false,
    groupBy: 'carrier',
    lenses: ['entered'],
  },
  {
    id: 'in-docked',
    direction: 'inbound',
    label: 'Docked',
    hint: 'Docked, not unboxed — door-scanned or received at the dock and not yet opened on Unbox',
    kind: 'open',
    section: 'work',
    staffLabel: 'Docked by',
    channels: ONLINE,
    carrier: false,
    groupBy: 'staff',
    lenses: ['entered', 'received'],
  },
  {
    id: 'in-transit',
    direction: 'inbound',
    label: 'In transit',
    hint: 'Expected purchase / marketplace shipments the carrier has and has not delivered',
    kind: 'open',
    section: 'moving',
    staffLabel: null,
    channels: ONLINE,
    carrier: false,
    groupBy: 'carrier',
    lenses: ['entered'],
  },
  {
    id: 'in-unboxed',
    direction: 'inbound',
    label: 'Unboxed',
    hint: 'Cartons opened on Unbox',
    kind: 'done',
    section: 'done',
    staffLabel: 'Unboxed by',
    channels: ONLINE,
    carrier: false,
    groupBy: 'staff',
    lenses: ['entered', 'received', 'unboxed'],
  },
];

const STATUS_BY_ID = Object.fromEntries(LIVE_FEED_STATUSES.map((s) => [s.id, s])) as Readonly<
  Record<LiveFeedStatusId, LiveFeedStatusSpec>
>;

export function getLiveFeedStatus(id: LiveFeedStatusId): LiveFeedStatusSpec {
  return STATUS_BY_ID[id];
}

export function isLiveFeedStatusId(raw: string): raw is LiveFeedStatusId {
  return Object.hasOwn(STATUS_BY_ID, raw);
}

/** Does `spec` show under the channel pick (null = both channels)? */
export function liveFeedStatusInChannel(spec: LiveFeedStatusSpec, channel: LiveFeedChannel | null): boolean {
  return channel == null || spec.channels.includes(channel);
}

/** Can a package in `spec`'s lane have had the `lens` event? Not applicable = the column is muted, counted 0. */
export function liveFeedLensApplies(spec: Pick<LiveFeedStatusSpec, 'lenses'>, lens: LiveFeedLens): boolean {
  return spec.lenses.includes(lens);
}

/** One direction's lanes in pipeline order — the board's column order — optionally only those of `channel`. */
export function liveFeedStatusesOf(direction: LiveFeedDirection, channel: LiveFeedChannel | null = null): LiveFeedStatusSpec[] {
  return LIVE_FEED_STATUSES.filter((spec) => spec.direction === direction && liveFeedStatusInChannel(spec, channel));
}

/** The stored token for a package with no carrier (`carrier-resolution.ts` UNKNOWN_CARRIER). */
export const LIVE_FEED_UNKNOWN_CARRIER = 'UNKNOWN';

/** `FEDEX` → `FedEx`, `UNKNOWN` → `Unknown`; an unrecognized token paints as stored. */
export function liveFeedCarrierLabel(carrier: string | null | undefined): string {
  const token = String(carrier ?? '').trim();
  if (!token || token.toUpperCase() === LIVE_FEED_UNKNOWN_CARRIER) return 'Unknown';
  return displayCarrierFromHint(token) ?? token;
}

/** The permission each direction needs; the feed opens with either. */
export const LIVE_FEED_DIRECTION_PERMISSION = { outbound: 'packing.view', inbound: 'receiving.view' } as const;
export const LIVE_FEED_PERMISSIONS = [LIVE_FEED_DIRECTION_PERMISSION.outbound, LIVE_FEED_DIRECTION_PERMISSION.inbound] as const;

/** Directions a viewer may see. */
export interface LiveFeedAccess {
  inbound: boolean;
  outbound: boolean;
}

export function liveFeedAccess(permissions: { has(permission: string): boolean }): LiveFeedAccess {
  return {
    inbound: permissions.has(LIVE_FEED_DIRECTION_PERMISSION.inbound),
    outbound: permissions.has(LIVE_FEED_DIRECTION_PERMISSION.outbound),
  };
}
