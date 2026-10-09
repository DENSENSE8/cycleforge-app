/**
 * The returns filed against an outbound order — every receiving line filed
 * as a return (`receiving_line_return`) whose return names this order, or
 * whose unit is one this order shipped and came back after it was allocated.
 *
 * Reader: the order timeline payload (`returns`), which every order record —
 * Search, the desks, Unbox's Return order — paints as its return reason above
 * Fulfillment (`OrderReturnReason`).
 */

type Rows = Array<Record<string, unknown>>;

/**
 * What Unbox stores when it links a returned unit before any platform said
 * why (`returned-serial-link.ts`): intake provenance, not a buyer's reason —
 * the record reads it as "no reason" until a platform report lands one.
 */
export const UNBOX_SERIAL_SCAN_REASON = 'customer return (unbox scan)';
export const UNBOX_SALES_ORDER_IMPORT_REASON = 'sales order import (unbox)';
const PROVENANCE_ONLY_REASONS: Record<string, true> = {
  [UNBOX_SERIAL_SCAN_REASON]: true,
  [UNBOX_SALES_ORDER_IMPORT_REASON]: true,
};

/** A stored return reason as a buyer's reason: trimmed, and null when empty or provenance-only. */
export function buyerReturnReason(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return value && !PROVENANCE_ONLY_REASONS[value.toLowerCase()] ? value : null;
}

export interface OrderReturn {
  receivingLineId: number;
  receivingId: number | null;
  /** The stored reason (marketplace code or words); decode with `readReturnReason`. */
  reason: string | null;
  rma: string | null;
  receivedAt: string | null;
}

/** `$1` organization id, `$2` `orders.id`. */
export const ORDER_RETURNS_SQL = `SELECT rl.id AS receiving_line_id, rl.receiving_id, rlr.return_reason, rlr.rma_ref, rl.created_at
  FROM receiving_line rl
  JOIN receiving_line_return rlr ON rlr.receiving_line_id = rl.id AND rlr.organization_id = rl.organization_id
 WHERE rl.organization_id = $1
   AND (
     UPPER(BTRIM(rlr.source_order_id)) = (SELECT UPPER(BTRIM(o.order_id)) FROM orders o WHERE o.id = $2 AND o.organization_id = $1)
     OR EXISTS (
       SELECT 1
         FROM receiving_line_unit rlu
         JOIN order_unit_allocations oua ON oua.serial_unit_id = rlu.serial_unit_id
        WHERE rlu.organization_id = $1 AND rlu.receiving_line_id = rl.id
          AND oua.order_id = $2 AND rl.created_at > oua.allocated_at
     )
   )
 ORDER BY rl.created_at DESC
 LIMIT 10`;

/**
 * One entry per filed return. Provenance-only reasons read as none, and once
 * any return carries a real reason the reasonless entries (the Unbox intake
 * line beside the platform report's line) step aside.
 */
export function toOrderReturns(rows: Rows): OrderReturn[] {
  const all = rows.map((r) => {
    const reason = buyerReturnReason(typeof r.return_reason === 'string' ? r.return_reason : null);
    return {
      receivingLineId: Number(r.receiving_line_id),
      receivingId: r.receiving_id == null ? null : Number(r.receiving_id),
      reason,
      rma: typeof r.rma_ref === 'string' && r.rma_ref.trim() ? r.rma_ref.trim() : null,
      receivedAt: r.created_at == null ? null : new Date(String(r.created_at)).toISOString(),
    };
  });
  const reasoned = all.filter((entry) => entry.reason != null);
  return reasoned.length > 0 ? reasoned : all.slice(0, 1);
}
