/** The row view-model a family builds from its record — one shape, presentation facts only. */

import type { LifecycleState } from '@cycleforge/design-tokens';
import type {
  Delay,
  NextStep,
  SlotValue,
  StateTone,
  SubtitlePart,
} from '@/lib/tables/field-catalog/slot-value';

/** Shallow product facts under a row — serials, bin/location, jump to unit. */
export interface RowDetail {
  /** Attached unit serials, first-seen order. Empty = honest dash. */
  serials: readonly string[];
  /** Staging / pack / pick location label. */
  location: string | null;
  /**
   * Handle for `/search?sel=unit:…` — serial number, unit_uid, or serial_units id.
   * Null hides "View unit".
   */
  unitRef: string | null;
  /** Listing / catalog SKU when useful beside location. */
  sku: string | null;
}

export interface RowView {
  /** Stable row id — used for keys and the open intent. */
  id: string;
  /** Square photo. `null` renders the typed placeholder, never a broken image. */
  thumbUrl: string | null;

  /** What the thing is. */
  title: string;
  /** Title hyperlink — the listing this row sells. */
  titleHref?: string | null;
  /** The operator note on this row. */
  note: string | null;
  /**
   * Optional triage flag mark beside the title — the wash's non-colour carrier
   * (Orders row flags). Presentational only: label + tip + solid-dot class.
   */
  flagMark?: {
    label: string;
    tip: string;
    dotClass: string;
  } | null;
  /** PRODUCT-LEVEL status — exception / out of stock. */
  itemStatus?: {
    label: string;
    /** Plain-text fallback / exception tip. */
    tip: string;
    /** Structured shortage card. */
    card?: {
      thumbUrl: string | null;
      sku: string | null;
      title: string;
      qtyShort: number;
      kind: 'listing' | 'kit_part' | 'rollup';
      rollupSkus?: readonly string[];
      pipelineLabel?: string | null;
    } | null;
  } | null;
  /**
   * Shopify-like bundle / kit face under the item title.
   * Present when the listing's sku_catalog has composition components
   * (sku_relationships preferred, else sku_kit_parts). Never Zoho `-P`.
   */
  kitFace?: {
    label: string;
    source: 'catalog_edge' | 'kit_part';
    components: readonly {
      key: string;
      title: string;
      sku: string | null;
      qty: number;
      thumbUrl: string | null;
    }[];
  } | null;
  /** LEADING EDGE RAIL — TRIAGE HEAT, order-level and product-level (operator 2026-09-15). */
  edgeMark?: {
    /** Operator word — "Urgent", "Out of stock". The fact, not the paint. */
    label: string;
    /**
     * Which triage mark this is: `'urgent'` (expedite) or `'attention'`
     * (shortage / exception). Chooses the resting glyph — bolt vs triangle.
     */
    kind: 'urgent' | 'attention';
    /** Solid background class for the 3px bar, from the family's SoT. */
    barClass: string;
    /** Slow 1px traveler on `y`. */
    pulse?: boolean;
    /** Lighter fill for the 1px traveler. Required when `pulse`. */
    tickClass?: string;
  } | null;

  /**
   * A just-imported order earns a blue, timed rail without displacing a hotter
   * urgent or cannot-ship rail. Its label carries the elapsed import time.
   */
  importMark?: {
    label: string;
    barClass: string;
    tickClass?: string;
  } | null;

  /** The fulfillment handle (order #, PO). */
  orderId: string | null;
  /** Carrier tracking (this line's primary). */
  tracking: string | null;
  /** Every tracking number on this commercial object, first-seen order. */
  trackings?: readonly string[] | null;
  /** True when a multi-line parent already painted the order/PO. */
  quietIdentity?: boolean;
  /** Raw source-platform value — resolved to the ORDER identity brand dot. */
  platformValue: string | null;
  /**
   * Authoritative carrier from the shipment/label, when the family has one.
   * `null` falls back to detecting the brand from the number itself.
   */
  carrier: string | null;

  /** When the row STARTED (an order's purchase date, a PO's raised date). */
  orderedAt?: {
    label: string;
    tip?: string;
    /** `YYYY-MM-DD` — seeds the calendar and is what an edit commits against. */
    dateKey?: string | null;
  } | null;

  /** The state pill. */
  stateLabel: string;
  stateTone: StateTone;
  /** The lifecycle state the pill names, when it is one (`packed`, `shipped`, …). */
  stateLifecycle?: LifecycleState;
  /** Hover detail for the state pill. */
  stateTip?: string;
  /** The DELAY, not a generic timestamp. */
  delay: Delay | null;
  /** Hover detail for the delay (the actual deadline instant). */
  delayTip?: string;

  /** Where this row goes NEXT. */
  nextStep?: NextStep | null;

  /** The money this row is worth, already formatted. */
  amount: string | null;

  /** Resolved SLOT values, keyed by TRACK key (`status:1`, `status:2`, …). */
  slots?: Readonly<Record<string, SlotValue>>;

  /** BOUND subtitle parts for the item's second line — the org-configured replacement for {@link note}. */
  subtitleParts?: readonly SubtitlePart[];

  /** Shallow product facts (serial / location / unit). */
  detail?: RowDetail | null;
}

/** First non-blank note, in the adapter's priority order. */
export function firstNote(values: readonly (string | null | undefined)[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}
