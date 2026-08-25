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
   * Hover detail for the state pill.
   *
   * The pill clips to one line inside a 10rem track, so a family whose state
   * vocabulary is longer than the track (Incoming's `Delivered · not scanned`)
   * needs somewhere to put the full phrase. `undefined` renders the bare pill —
   * the label is already the whole fact on Receiving and Orders.
   */
  stateTip?: string;
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

  /**
   * AMOUNT column, top — the money this row is worth, already formatted.
   *
   * Pre-formatted by the adapter on purpose. The view model is strings and
   * enums by contract, and currency is a locale/tenant decision that belongs to
   * whatever SoT the family already uses — not to a table cell that would have
   * to grow an opinion about minor units and signs.
   *
   * `null` renders an empty track, which is the honest answer for a checklist
   * item. A row that HAS money and shows nothing would be the bug.
   */
  amount: string | null;
  /**
   * AMOUNT column, bottom — the arithmetic behind it (`×3 @ $49.99`).
   *
   * The second line is the WORKING, not a timestamp: a cart line's total is a
   * number somebody will be asked to justify at the counter, and showing the
   * multiplication under it answers the question before it is asked.
   */
  amountNote?: string | null;
  /**
   * Is this amount a CREDIT (money going the other way)?
   *
   * A trade-in is negative and must not read as a discount on a sale. The minus
   * sign alone is easy to miss down a column of tabular figures, so the tone
   * carries it too. Deliberately not a colour name — the cell owns the paint.
   */
  amountCredit?: boolean;
}

/**
 * One entry in a row's three-dot menu.
 *
 * Presentational by the same rule as the view model: a label, a key and a
 * callback. No icons and no JSX, so a family cannot smuggle bespoke markup into
 * the shared row through its action list.
 */
export interface CompoundRowAction {
  key: string;
  label: string;
  onSelect: () => void;
  /** `'danger'` paints destructive (void, delete). Default is ordinary. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
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
