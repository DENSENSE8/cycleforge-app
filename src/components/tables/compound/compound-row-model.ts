/**
 * The COMPOUND row view-model — one shape every table adapts into.
 *
 * This is the anti-fork seam. A two-row WMS cell needs the same six facts on
 * every surface (a picture, a name, its codes, a fulfillment id, a state, a
 * stamp), but each family stores them under different column names on a
 * different row type. The tempting move is a compound cell set per family;
 * that is four copies of the same layout drifting apart the first time one gets
 * a fix.
 *
 * Instead: **one renderer, many adapters.** A family writes a pure
 * `row -> CompoundRowView` function — no JSX, no hooks, trivially testable —
 * and inherits the layout, the alignment rules and every future fix for free.
 * Adding a table is a mapper, not a cell set.
 *
 * Deliberately flat and presentational: strings and enums only, no React nodes.
 * A view-model that could carry JSX would let a family smuggle bespoke markup
 * back in, which is the fork wearing a different hat. Where a family genuinely
 * needs a house chip (order id, tracking), it names the VALUE and the renderer
 * picks the chip.
 */

/**
 * How late a row is. `days` is whole days past its deadline; `overdue` false
 * means it still has time, so the row shows an on-time face rather than a
 * number the operator has to parse to discover it means "fine".
 */
export interface CompoundDelay {
  days: number;
  overdue: boolean;
}

/** Lifecycle tone — deliberately small, and deliberately not a colour. */
export type CompoundStateTone =
  /** Ordinary progress. Neutral by default — most WMS states are unremarkable. */
  | 'neutral'
  /** Finished / confirmed. */
  | 'done'
  /** Needs a human: hold, exception, mismatch. The only attention-grabbing tone. */
  | 'alert';

export interface CompoundRowView {
  /** Stable row id — used for keys and the open intent. */
  id: string;
  /** Square photo. `null` renders the typed placeholder, never a broken image. */
  thumbUrl: string | null;

  /** TITLE column, top — what the thing is. */
  title: string;
  /**
   * TITLE column, bottom — the operator note on this row.
   *
   * Was the SKU/code list until the column contract was ruled (see the hard
   * rules in `docs/todo/compound-row-column-contract-HANDOFF.md`). Codes are an
   * identifier and identifiers belong in the IDS column; what an operator needs
   * under a title is what somebody wrote about this specific row.
   */
  note: string | null;

  /** Column 3 top — the fulfillment handle (order #, PO). */
  orderId: string | null;
  /** Column 3 bottom — carrier tracking. */
  tracking: string | null;
  /** Raw source-platform value — resolved to the ORDER identity brand dot. */
  platformValue: string | null;
  /**
   * Authoritative carrier from the shipment/label, when the family has one.
   * Resolved to the TRACKING identity brand dot; `null` falls back to detecting
   * the brand from the number itself.
   */
  carrier: string | null;

  /** Column 4 top — the state pill. */
  stateLabel: string;
  stateTone: CompoundStateTone;
  /**
   * STATUS column, bottom — the DELAY, not a generic timestamp.
   *
   * A WMS row's second status line answers "is this late, and by how much" —
   * the question that decides what an operator picks up next. A creation or
   * transition stamp answers "when did this happen", which nobody triages on.
   * `null` means on time and renders as the on-time face, never as blank.
   */
  delay: CompoundDelay | null;
  /** Hover detail for the delay (the actual deadline instant). */
  delayTip?: string;
}

/**
 * A family's row → view mapping. Pure by contract: it runs inside a render for
 * every visible row, so it must not allocate anything expensive, hit a hook, or
 * read the DOM.
 */
export type CompoundRowAdapter<Row> = (row: Row) => CompoundRowView;

/**
 * First non-blank note, in the adapter's priority order.
 *
 * A row shows ONE note line and never concatenates: two notes joined by a
 * separator read as a single sentence that nobody wrote, and the clipped line
 * would usually cut the second one mid-word anyway. The adapter orders them
 * most-specific-first; this picks the first that has something to say.
 */
export function firstNote(values: readonly (string | null | undefined)[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}
