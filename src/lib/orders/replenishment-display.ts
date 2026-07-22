/**
 * Replenishment / backorder presentation SoT for order surfaces.
 *
 * Maps `replenishment_requests.status` (enum: detected · pending_review ·
 * planned_for_po · po_created · waiting_for_receipt · fulfilled · cancelled —
 * see the baseline migration) to the ONE label/tone story every view uses.
 * The Pending grid's `stock` column, tooltips, and any future backorder rollup
 * resolve through here — never an inline status map in a component
 * (`workflow-stages.ts` discipline).
 *
 * The standard backorder-row anatomy this powers: shortfall qty · fulfillment
 * status · expected-supply signal (PO#) — data facts only; the free-text
 * `out_of_stock` reason is NOT part of this registry (it surfaces only via the
 * Product-cell OOS corner indicator).
 */

interface ReplenishmentStatusMeta {
  /** Full status label (tooltips, detail panes). */
  label: string;
  /** ≤7-char cell word beside the shortfall qty in the narrow stock track. */
  short: string;
  /** 3-layer chip tone classes (house chip anatomy: bg · text · ring). */
  chip: string;
}

const CHIP = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  gray: 'bg-surface-sunken text-text-muted ring-border-default',
} as const;

const REPLENISHMENT_STATUS_META: Record<string, ReplenishmentStatusMeta> = {
  detected:            { label: 'Shortage detected',   short: 'need',    chip: CHIP.amber },
  pending_review:      { label: 'Pending review',      short: 'review',  chip: CHIP.amber },
  planned_for_po:      { label: 'Planned for PO',      short: 'plan',    chip: CHIP.blue },
  po_created:          { label: 'PO created',          short: 'PO',      chip: CHIP.blue },
  waiting_for_receipt: { label: 'Waiting for receipt', short: 'inbound', chip: CHIP.indigo },
  fulfilled:           { label: 'Restocked',           short: 'stocked', chip: CHIP.emerald },
  cancelled:           { label: 'Cancelled',           short: 'void',    chip: CHIP.gray },
};

const UNKNOWN_STATUS: ReplenishmentStatusMeta = {
  label: 'Replenishment',
  short: 'restock',
  chip: CHIP.gray,
};

/** Resolve a raw status (NULL-safe) to its display meta. */
export function replenishmentStatusMeta(status: string | null | undefined): ReplenishmentStatusMeta {
  const key = String(status ?? '').trim().toLowerCase();
  return REPLENISHMENT_STATUS_META[key] ?? UNKNOWN_STATUS;
}

/** The replenishment facts a queue row may carry (all NULL when the tenant has
 *  no replenishment schema — display must degrade to quiet-empty). */
interface RowReplenishmentFacts {
  requestId: string | null;
  status: string | null;
  quantityToOrder: number | null;
  poNumber: string | null;
  notes: string | null;
}

/** Pull the `replenishment_*` fields off a loosely-typed orders row. */
export function rowReplenishmentFacts(row: Record<string, unknown>): RowReplenishmentFacts {
  const rawQty = row.replenishment_quantity_to_order;
  const qty = rawQty == null || rawQty === '' ? NaN : Number(rawQty);
  return {
    requestId: (row.replenishment_request_id as string | null | undefined) ?? null,
    status: (row.replenishment_status as string | null | undefined) ?? null,
    quantityToOrder: Number.isFinite(qty) ? qty : null,
    poNumber: (row.replenishment_po_number as string | null | undefined) ?? null,
    notes: (row.replenishment_notes as string | null | undefined) ?? null,
  };
}

/** One-line tooltip for the stock cell: status · ordering N · PO · notes. */
export function replenishmentTooltip(facts: RowReplenishmentFacts): string {
  const meta = replenishmentStatusMeta(facts.status);
  return [
    `Restock · ${meta.label}`,
    facts.quantityToOrder != null ? `ordering ${facts.quantityToOrder}` : null,
    facts.poNumber ? `PO ${facts.poNumber}` : null,
    facts.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
