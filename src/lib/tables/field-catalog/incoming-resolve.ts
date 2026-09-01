/**
 * Incoming slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks.
 *
 * Incoming carries the same `ReceivingLineRow` as Unbox / History, so the
 * temptation is to reuse `receiving-resolve.ts`. It does not, and the reason is
 * the whole point of the two families: `receiving.status` answers what the
 * WAREHOUSE has done (`workflow_status`), `incoming.status` answers what the
 * CARRIER has done (`delivery_state`). One resolver serving both ids would have
 * to branch on the field id anyway — and would let a `receiving.*` binding
 * resolve on an Incoming row, which is exactly the lane-dependent silence the
 * catalog exists to prevent.
 *
 * Vocabularies are never declared here: the delivery state resolves through
 * `incomingStateFace` (the same SoT the hunt tiles and the compound state pill
 * read) and the channel through `sourcePlatformLabel`.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { conditionLabel } from '@/lib/conditions';
import { incomingStateFace } from '@/lib/receiving/incoming-compound-view';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveIncomingSlotValue(
  row: ReceivingLineRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'incoming.order':
      return {
        kind: 'value',
        text: str(row.zoho_purchaseorder_number) ?? str(row.zoho_reference_number),
      };
    case 'incoming.expected': {
      const raw = str(row.po_date);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    case 'incoming.qty': {
      // The EXPECTED count is the question on this lane — nothing has arrived
      // yet. `null` rather than 0 when the PO line carries no quantity.
      const qty = row.quantity_expected;
      return { kind: 'value', text: qty == null ? null : String(qty) };
    }
    case 'incoming.status':
      return { kind: 'value', text: incomingStateFace(row).label };
    case 'incoming.platform': {
      const raw = str(row.source_platform) ?? str(row.inbound_source_type);
      return { kind: 'value', text: raw ? sourcePlatformLabel(raw) : null };
    }
    case 'incoming.tracking':
      return { kind: 'value', text: str(row.tracking_number) };
    case 'incoming.condition': {
      const grade = str(row.condition_grade);
      return { kind: 'value', text: grade ? conditionLabel(grade, 'compact') : null };
    }
    default:
      return null;
  }
}

/**
 * Every bound slot for one row, keyed by TRACK key — the `slots` half of the
 * shared `CompoundRowView`. Built from the MOUNTED model so a rebind re-points
 * the cell with no change here.
 */
export function incomingSlotValuesFor(
  row: ReceivingLineRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveIncomingSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
