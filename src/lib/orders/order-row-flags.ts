/**
 * Order row flags — the operator-set triage tag that tints a queue row.
 *
 * A dispatch queue is scanned, not read: an operator needs to isolate "the four
 * rows I already looked at" or "the two that are blocked" without re-reading
 * seven columns per row. Row tint is the cheapest possible carrier for that,
 * and every ops spreadsheet in the category ships it (Airtable record coloring,
 * Sheets conditional fill, Excel highlight).
 *
 * **A flag is a NAMED TAG, never a raw swatch.** Colour on its own carries no
 * meaning across a shift handoff — two staffers will use yellow for different
 * things inside a week, and the third one has no way to ask. Every flag here
 * pairs a semantic tone with a word, so the row tint is readable in the grid
 * and the reason is legible in the inspector, the menu, and the audit row.
 *
 * **Flags are ORG-WIDE**, not per-staff: the whole point is that the next shift
 * sees what this shift flagged. That is also why the writer stamps
 * `set_by_staff_id` — a shared signal with no author is an anonymous claim.
 *
 * This module is pure and dependency-free so the row renderer, the selection
 * bar, the inspector, the API validator, and the guard test all resolve the
 * same five ids from one list. Adding a flag = one entry here + one value in
 * the `order_flags_flag_chk` CHECK (migration).
 */

/** Stable ids — persisted in `order_flags.flag`. Never rename one in place. */
export const ORDER_ROW_FLAG_IDS = [
  'priority',
  'hold',
  'damaged',
  'awaiting_customer',
  'ready',
] as const;

export type OrderRowFlagId = (typeof ORDER_ROW_FLAG_IDS)[number];

interface OrderRowFlag {
  id: OrderRowFlagId;
  /** Operator-facing name. This is the fact; the colour is the accelerator. */
  label: string;
  /** One line on when to use it — the menu's tooltip, so the set stays shared. */
  hint: string;
  /**
   * Row wash. `-50` matches the weight of the selected fill
   * (`QUEUE_ROW.selectedLedgerClass`) so a flagged row never out-shouts the row
   * the operator is actually working. Sticky identity cells are `bg-inherit`,
   * so this propagates through the frozen pane for free.
   *
   * **No blue.** Blue is selection on this surface; a blue flag would make
   * "I picked this" and "someone flagged this" the same colour.
   */
  rowClass: string;
  /** Solid dot for the row's flag indicator + the menu's leading mark. */
  dotClass: string;
  /** House 3-layer chip (`bg-x-50` + `text-x-700` + `ring-x-200`). */
  chipClass: string;
}

const FLAGS: Record<OrderRowFlagId, OrderRowFlag> = {
  priority: {
    id: 'priority',
    label: 'Priority',
    hint: 'Pull this one forward — ahead of its ship-by.',
    rowClass: 'bg-violet-50',
    dotClass: 'bg-violet-500',
    chipClass: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  hold: {
    id: 'hold',
    label: 'Hold',
    hint: 'Do not pick or pack yet — something is unresolved.',
    rowClass: 'bg-amber-50',
    dotClass: 'bg-amber-500',
    chipClass: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  damaged: {
    id: 'damaged',
    label: 'Damaged',
    hint: 'Unit or packaging is damaged — needs a decision before it ships.',
    rowClass: 'bg-rose-50',
    dotClass: 'bg-rose-500',
    chipClass: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  awaiting_customer: {
    id: 'awaiting_customer',
    label: 'Awaiting customer',
    hint: 'Blocked on a reply — address, variant, or return authorization.',
    // Identity-hue registry. "Parked, not on us" is the one state whose correct
    // reading IS muted — a saturated hue would claim the row needs attention
    // when the whole point is that it does not.
    rowClass: 'bg-slate-100', // ds-allow-raw-neutral: parked state reads muted by design
    dotClass: 'bg-slate-500', // ds-allow-raw-neutral: matches the parked row wash
    chipClass: 'bg-slate-100 text-slate-700 ring-slate-300', // ds-allow-raw-neutral: same identity hue
  },
  ready: {
    id: 'ready',
    label: 'Ready',
    hint: 'Checked and clear — safe for the next station to take.',
    rowClass: 'bg-emerald-50',
    dotClass: 'bg-emerald-500',
    chipClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
};

/** Menu / legend order — most-interrupting first, all-clear last. */
export const ORDER_ROW_FLAGS: readonly OrderRowFlag[] = ORDER_ROW_FLAG_IDS.map((id) => FLAGS[id]);

export function isOrderRowFlagId(value: unknown): value is OrderRowFlagId {
  return typeof value === 'string' && (ORDER_ROW_FLAG_IDS as readonly string[]).includes(value);
}

/**
 * Resolve a stored flag id to its presentation.
 *
 * Returns `null` for anything unknown rather than throwing or substituting a
 * default: a row written by a newer deploy (or a hand-edited row) must render
 * as *unflagged*, not as some arbitrary colour the operator never chose.
 */
export function resolveOrderRowFlag(value: unknown): OrderRowFlag | null {
  return isOrderRowFlagId(value) ? FLAGS[value] : null;
}
