/**
 * RecordModel — the ONE shape {@link RecordView} paints (owner 2026-09-29):
 * every desk record (inbound delivery / carton, local pickup, repair, QC unit)
 * is one two-column body — main = the work (the fulfillment band, items,
 * serials, staff notes), aside = the evidence (photos door, alerts, party →
 * hairline → movement). Domain adapters build it from their reads; the view
 * never knows which desk it is on.
 */

import type { ReactNode } from 'react';
import type { StageStaffLane } from '@/components/tables/compound/staff-stage-lane';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import type { RecordPriceRow } from '@/design-system/components/record-ledger/RecordPriceBreakdown';
import type { StateName } from '@/design-system/tokens/lifecycle';
import type { CarrierEvent } from '@/lib/queries/carrier-events-query';
import type { DeliveryPromiseInput } from '@/lib/shipping/delivery-promise';

/** One label · value row of a facts region. Only facts the record carries are listed — nothing is dashed in. */
export interface RecordFact {
  label: string;
  value: ReactNode;
  /** Long values (notes) stack under their label. */
  wide?: boolean;
}

/** A step of the record's internal ladder: stamped (done / partial), or not yet. */
export type RecordStepState = 'done' | 'partial' | 'todo' | 'unrecorded';

export interface RecordStep {
  key: string;
  label: string;
  state: RecordStepState;
  who?: string | null;
  at?: string | null;
  /** A calendar-day stamp (a PO date) paints no time. */
  dateOnly?: boolean;
  detail?: string | null;
  /** The step's glyph and lifecycle tone — from the domain's token registry. */
  icon: ReactNode;
  tone?: StateName;
}

/** One item on the shared `RecordItem` ruler. */
export interface RecordModelItem {
  key: string;
  title: string;
  sku: string | null;
  /** `sku_catalog.id` — where a product photo uploaded on the tile lands; null = not catalogued. */
  skuCatalogId: number | null;
  photoUrl: string | null;
  received: number | null;
  expected: number | null;
  /** Receipt short of what was ordered — the count reads in warning ink. */
  short: boolean;
  /** Condition face, and its grade code — the grade picks the ink. */
  condition: string | null;
  conditionGrade: string | null;
  listing: { href: string | null; itemNumber: string | null } | null;
  /** The unit identities, INLINE on their item. */
  serials: readonly string[];
  /** Waiver / over-count note under the serials. */
  serialNote: string | null;
  /** The line price, read on the item itself. */
  cost: { unit: number | null; qty: number; total: number | null } | null;
  /** What the item carries beyond identity: claim, notes. */
  facts: readonly RecordFact[];
  /** Per-item state chips / controls under the ruler (unit QC + label state on a pickup). */
  extra?: ReactNode;
  current: boolean;
}

export interface RecordModel {
  /** Resets the record's own state (an open panel) when a different record opens. */
  key: string;
  title: {
    /** The internal record number — PO #, LCPU id, RS id, serial. */
    ref: string;
    /** A platform token (`zoho`, `ebay`) — tints the `#` and names the platform. */
    platform: string | null;
    /** A channel word when no platform names it ("Local pickup", "Walk-in"). */
    channel?: string | null;
    date: { label: string; tip: string } | null;
    /** A helpdesk ticket chip after the date. */
    ticket?: { label: string; href: string | null } | null;
  };
  status: { label: string; detail?: string };
  alerts: readonly { key: string; label: string }[];
  exception: { why: string; next: string } | null;
  /** Main band title: "Receiving", "Repair", "Quality control". */
  internalLabel: string;
  /** Which way the goods move — picks the aside's party / movement words. */
  flow: 'inbound' | 'outbound';
  /** Aside section titles when the flow's words do not fit ("Customer", "Ticket"). */
  partyTitle?: string;
  movementTitle?: string;
  /** The band's top-right dates (Ordered · Expected, or Docked). */
  dates: readonly { label: string; value: string; tip?: string }[];
  /** The carrier's promised arrival. */
  promise: DeliveryPromiseInput | null;
  /** The external half: carrier scans, or the domain's own node (a pickup, a counter drop-off). null hides it. */
  external: { events: readonly CarrierEvent[]; carrier: string | null; loading: boolean; error: boolean } | { node: ReactNode } | null;
  internal: readonly RecordStep[];
  /** One step assignable in line (the Tested step's tester). */
  stepAssign: {
    stepKey: string;
    label: string;
    role: StageStaffLane;
    staffId: number | null;
    onCommit: (staffId: number | null) => Promise<unknown>;
  } | null;
  /** null while the item read is loading. */
  items: readonly RecordModelItem[] | null;
  /** Controls in the Items header (filter chips, batch verbs). */
  itemsHeader?: ReactNode;
  /** Shown instead of (or under) the items — why there are none, what failed. */
  itemsNotice: ReactNode | null;
  itemsSummary: string | null;
  serials: readonly string[];
  expectedUnits: number | undefined;
  notes: readonly RecordFact[];
  /** The inline staff-note editor under the serials. */
  staffNote: ReactNode | null;
  /** The Items group's money footer; null = no price known. */
  price: { rows: readonly RecordPriceRow[] } | null;
  /** The currency every price on the record reads in. */
  currency: string | null;
  /** Refetch the record's reads (after a product photo upload). */
  refresh: (() => void) | null;
  /** Phone surfaces open the camera from the item tile. */
  capturePhotos?: boolean;
  /** The evidence door, top of the aside. */
  photos: ReactNode;
  /** Aside, top: who the goods come from / go to. */
  party: readonly RecordFact[];
  /** Aside, under the hairline: the movement — tracking, arrival, pickup, ticket. */
  movement: readonly RecordFact[];
  /** A load failure the whole record should say out loud, with its retry. */
  loadFailed: { message: string; retry: () => void } | null;
}

/**
 * A header verb. `panel` verbs swap the record's body for their panel, with
 * Back to return — secondary evidence is one click away in the header, never
 * an inline disclosure.
 */
export interface RecordVerb extends RecordActionVerb {
  panel?: (done: () => void) => ReactNode;
}

/** A verb's panel, in place of the record body while it is open. */
export interface RecordPanel {
  title: string;
  body: ReactNode;
  onBack: () => void;
}

/** Money in the record's currency (USD when unknown). */
export function recordMoney(value: number | string | null | undefined, currency: string | null): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}
