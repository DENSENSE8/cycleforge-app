/**
 * Replenishment / backorder presentation SoT for order surfaces.
 *
 * Maps `replenishment_requests.status` to the ONE label story every view uses.
 * The Pending grid's OOS corner-indicator tooltip resolves through
 * {@link replenishmentTooltip} — never an inline status map in a component.
 * (The dedicated `stock` grid column was retired 2026-07-22; short/chip cell
 * tones were removed with it — revive only when a rollup consumer needs them.)
 */

interface ReplenishmentStatusMeta {
  /** Full status label (tooltips, detail panes). */
  label: string;
}

const REPLENISHMENT_STATUS_META: Record<string, ReplenishmentStatusMeta> = {
  detected: { label: 'Shortage detected' },
  pending_review: { label: 'Pending review' },
  planned_for_po: { label: 'Planned for PO' },
  po_created: { label: 'PO created' },
  waiting_for_receipt: { label: 'Waiting for receipt' },
  fulfilled: { label: 'Restocked' },
  cancelled: { label: 'Cancelled' },
};

const UNKNOWN_STATUS: ReplenishmentStatusMeta = {
  label: 'Replenishment',
};

/** Resolve a raw status (NULL-safe) to its display meta. */
function replenishmentStatusMeta(status: string | null | undefined): ReplenishmentStatusMeta {
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

/** One-line replenishment summary (OOS indicator tooltip): status · ordering N · PO · notes. */
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
