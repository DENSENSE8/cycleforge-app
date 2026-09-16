/**
 * Admin › Returns slot resolvers — row + fieldId → the resolved fact a slot
 * cell paints. Pure functions; no React, no hooks.
 *
 * Two families' ids resolve here, and that is the point: the Returns desk
 * REUSES the `inventory-events` vocabulary for the facts both feeds carry
 * (`sku`, `occurred`, `status_change`, `notes`, `actor`) and adds its own only
 * for the three it carries alone. A bound id this feed has no fact for still
 * resolves to `null` — bindings do not cross into a family whose facts are not
 * on this row (the `incoming` / `receiving` rule).
 *
 * `inventory-events.occurred` resolves to the ABSOLUTE instant, never the
 * cell's relative age: a resolver that read the clock would make one row's
 * answer depend on when it happened to be called.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';

/** The landing status of every row on this feed — the query's own `WHERE`. */
export const RETURNED_STATE_LABEL = 'Returned';

/** Who took the unit in when no staffer is joined to the event. */
export const RETURNS_SYSTEM_ACTOR = 'system';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveAdminReturnsSlotValue(
  row: RecentReturnRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'admin-returns.unit':
      return { kind: 'value', text: str(row.serial_unit_id) };
    case 'admin-returns.tracking':
      return { kind: 'value', text: str(row.scan_token) };
    case 'admin-returns.order_ref': {
      const orderId = str(row.order_id);
      // The face the retired cell printed, minus the ` · ` the subtitle line
      // now owns — parts are joined by the engine, never by a resolver.
      return { kind: 'value', text: orderId ? `ord#${orderId}` : null };
    }
    case 'inventory-events.occurred':
      return { kind: 'value', text: str(row.occurred_at) };
    case 'inventory-events.sku':
      // No catalog title on this feed's wire row, so the SKU is the whole fact
      // (the Ledger's `sku · title` join has nothing to join here).
      return { kind: 'value', text: str(row.sku) };
    case 'inventory-events.status_change':
      /**
       * A transition with one varying end. Every row here landed on
       * {@link RETURNED_STATE_LABEL} — that is what the query selects — so the
       * fact an operator reads off this column is where the unit came FROM.
       * Resolving the pair as `prev → Returned` would print a constant on
       * every row and, worse, make the text unsortable by the end that moves.
       */
      return { kind: 'value', text: str(row.prev_status) };
    case 'inventory-events.notes':
      return { kind: 'value', text: str(row.notes) };
    case 'inventory-events.actor':
      // Person face: the staff join gives a NAME and no id on this feed, and
      // `system` is the honest answer for an unattributed intake — never a
      // bare numeric id, never an empty cell that reads as missing data.
      return {
        kind: 'person',
        staffId: null,
        name: str(row.actor_name) ?? RETURNS_SYSTEM_ACTOR,
      };
    default:
      return null;
  }
}
