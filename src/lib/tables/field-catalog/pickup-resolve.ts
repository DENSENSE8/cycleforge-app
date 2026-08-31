/**
 * Pickup slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks. The pickup half of the slot
 * contract (`docs/todo/slot-based-metadata-table-PLAN.md` §6.3): the catalog
 * names the fact, this module reads it off the `PickupLine` the feed already
 * returns — one resolver per catalog field, never a `row[path]` generic.
 *
 * `PickupLine` is imported TYPE-ONLY on purpose: `pickup-lines.ts` is a
 * client module (`'use client'`, react-query), and a value import would drag
 * it into every server consumer of this resolver. The money face duplicates
 * `pickupMoney`'s contract (`numeric(12,2)::text` → `$N.NN`) for the same
 * reason — the wire shape is the shared truth, not the client helper.
 *
 * Presentation TONES (condition grade class, status chip/dot) stay in the
 * family's row renderer, which resolves them from the same SoTs — this module
 * answers WHAT the fact says, in display text.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { PickupLine } from '@/components/receiving/pickup/pickup-lines';
import { conditionLabel } from '@/lib/conditions';
import { pickupOrderStatusLabel } from '@/lib/local-pickup/order-status';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** `numeric(12,2)::text` → `$N.NN` — the wire contract `pickupMoney` shares. */
function moneyText(raw: string | null | undefined): string {
  const n = Number((raw ?? '').trim());
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolvePickupSlotValue(
  line: PickupLine,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'pickup.order':
      return { kind: 'value', text: str(line.po_number) ?? `order:${line.order_id}` };
    case 'pickup.date': {
      const raw = str(line.pickup_date);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw) : null };
    }
    case 'pickup.status':
      return {
        kind: 'value',
        text: pickupOrderStatusLabel(line.order_status, {
          receivingId: line.receiving_id ?? null,
        }),
      };
    case 'pickup.sku':
      return { kind: 'value', text: str(line.sku) };
    case 'pickup.qty':
      return { kind: 'value', text: String(line.quantity) };
    case 'pickup.condition': {
      const grade = str(line.condition_grade);
      return { kind: 'value', text: grade ? conditionLabel(grade, 'compact') : null };
    }
    case 'pickup.price':
      return { kind: 'value', text: moneyText(line.total_price) };
    case 'pickup.customer':
      return { kind: 'value', text: str(line.customer_name) };
    default:
      return null;
  }
}
