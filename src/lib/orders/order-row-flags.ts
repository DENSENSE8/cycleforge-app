/** Order row flags — the operator-set triage tag that tints a queue row. */

/** Stable ids — persisted in `order_flags.flag`. Never rename one in place. */
export const ORDER_ROW_FLAG_IDS = [
  'priority',
  'hold',
  'damaged',
  'discrepancy',
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
  /** Row wash. `-50` matches the weight of the selected fill (`QUEUE_ROW.selectedLedgerClass`) so a flagged row never out-shouts the row the… */
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
  discrepancy: {
    id: 'discrepancy',
    label: 'Discrepancy',
    hint: 'Order, label, or physical item does not agree — resolve before it ships.',
    rowClass: 'bg-fuchsia-50',
    dotClass: 'bg-fuchsia-500',
    chipClass: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
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

/** Resolve a stored flag id to its presentation. */
export function resolveOrderRowFlag(value: unknown): OrderRowFlag | null {
  return isOrderRowFlagId(value) ? FLAGS[value] : null;
}
