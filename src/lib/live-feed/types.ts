/** The Live feed's wire shapes (`/api/live-feed/board`, `/api/live-feed/lane`) — always today's board. Client-safe. */

import type { LiveFeedFlag } from '@/lib/live-feed/flags';
import type { PackageStage } from '@/lib/live-feed/stages';

/** One step a package took: when, and who did it. */
export interface PackageStep {
  at: string | null;
  staffId: number | null;
  staffName: string | null;
}

/** Ship-by pressure on an open package, on the warehouse calendar. */
export type PackageUrgency = 'late' | 'due_today';

/**
 * What a card stands for: an order row (`order`), a scanned-out box no order
 * owns (`package`), or a scan-out that never resolved to a box (`scan`).
 * Only `order` cards take order writes (comments, tags, assign, print, scan out).
 */
export type PackageLink = 'order' | 'package' | 'scan';

/**
 * One package on the board — an Allocate order row (one line), which is the
 * grain Allocate counts. Orders that share a box share `shipmentId` and
 * `tracking`. A scan-out nothing links is still a card (`link`), so the
 * board shows everything the dock recorded.
 */
export interface PackageCard {
  /** `orders.id` — the record key, the comment and tag anchor. Negative (synthetic) when `link` is not `order`. */
  orderRowId: number;
  link: PackageLink;
  /** The carrier's latest words for the box, when polled. */
  carrierStatus: string | null;
  /** The marketplace order number. */
  orderNumber: string | null;
  stage: PackageStage;
  title: string;
  sku: string | null;
  photoUrl: string | null;
  qty: number | null;
  /** Allocate's sentence-case grade ("Used – Good"); `conditionCode` is the raw code its ink reads. */
  condition: string | null;
  conditionCode: string | null;
  price: string | null;
  /** `orders.account_source` — the sales channel. */
  platform: string | null;
  customer: string | null;
  shipmentId: number | null;
  tracking: string | null;
  carrier: string | null;
  shipBy: string | null;
  urgency: PackageUrgency | null;
  /** Out of stock (Allocate's Blocked). */
  blocked: boolean;
  /** When the package entered its current stage. */
  enteredAt: string | null;
  /** An open package that entered its stage before today. */
  earlier: boolean;
  /** Sat in its stage past `PACKAGE_STALL_HOURS` (picked not packed, packed not scanned out). */
  stalled: boolean;
  /** The other order rows in the same box (`shipmentId`), oldest first — empty when it ships alone. */
  boxMates: number[];
  steps: {
    ordered: PackageStep;
    picked: PackageStep;
    packed: PackageStep;
    scannedOut: PackageStep;
  };
  noteCount: number;
  latestNote: string | null;
  tags: string[];
  /** Active flags (`live_feed_flags`): reason, note, who and when — oldest first. Any card can carry them. */
  flags: LiveFeedFlag[];
  /**
   * The order's documents, as the docs popover's tabs count them: a shipping
   * label, a packing slip (a linked non-label document) and its product
   * paperwork (manuals / inserts). Null on an unlinked scan-out (no order).
   */
  docs: { label: boolean; slip: PackagePaperwork; paperwork: PackagePaperwork } | null;
}

/** An order's slip or product paperwork: on file, still owed, or exempt (the order, or for paperwork its SKU). */
export type PackagePaperwork = 'linked' | 'missing' | 'not_required';

export interface PackageColumn {
  stage: PackageStage;
  /** Exact: open stages = everything in the building; Scanned out = today. */
  count: number;
  /** Open stages: how many entered before today. */
  earlierCount: number;
  /** Open stages: past ship-by. */
  lateCount: number;
  /** Open stages: sat past `PACKAGE_STALL_HOURS`. */
  stalledCount: number;
  /** Scanned out: yesterday's count (the delta's base). */
  previousCount: number | null;
  items: PackageCard[];
  hasMore: boolean;
}

/** One carrier's load on the whole floor (sidebar filters NOT applied — a truck takes every box), keyed like `UPPER(BTRIM(carrier))`. */
export interface CarrierLoad {
  carrier: string;
  toPick: number;
  picked: number;
  packed: number;
  scannedOut: number;
}

/** A carrier's pickup today and what is still in the building for it. */
export interface PickupCountdown {
  carrier: string;
  /** The cutoff instant (ISO) and its warehouse wall-clock face (`HH:MM`). */
  cutoffAt: string;
  cutoffLocal: string;
  /** To pick + picked — not in a box yet. */
  notPacked: number;
  /** Packed, waiting at the dock. */
  packed: number;
  scannedOut: number;
}

export interface LiveFeedFacetOption {
  value: string;
  label: string;
  count: number;
}

/** Sidebar facet counts, each with every OTHER filter applied (the board's own membership). */
export interface LiveFeedFacets {
  carrier: LiveFeedFacetOption[];
  channel: LiveFeedFacetOption[];
}

/** The sidebar's own facet read adds what a board read does not count: documents owed and flag reasons. */
export interface LiveFeedSidebarFacets extends LiveFeedFacets {
  docs: LiveFeedFacetOption[];
  flag: LiveFeedFacetOption[];
}

export interface PackageBoard {
  generatedAt: string;
  columns: PackageColumn[];
  /** Packages scanned out per warehouse hour (index 0–23), today and yesterday. */
  pace: { today: number[]; yesterday: number[] };
  carriers: CarrierLoad[];
  /** Today's carrier pickups that are still ahead or were missed with packages left, soonest first. */
  pickups: PickupCountdown[];
  facets: LiveFeedFacets;
}

export interface PackageLanePage {
  stage: PackageStage;
  offset: number;
  items: PackageCard[];
  hasMore: boolean;
}
