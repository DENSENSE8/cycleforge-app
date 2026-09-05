/**
 * Receiving slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks. The receiving half of the slot
 * contract: the catalog names the fact, this module reads it off the
 * `ReceivingLineRow` the lines feed already returns — one resolver per catalog
 * field, never a `row[path]` generic.
 *
 * Presentation TONES (stage badge wash, condition grade colour, carrier brand
 * dot) stay in the family's cell map, which resolves them from the same SoTs —
 * this module answers WHAT the fact says, in display text.
 *
 * Honest absence is load-bearing here: a line with no unit cost resolves to
 * `null`, never `$0.00`. A receiving line frequently has no price at all (an
 * unfound line, a return, a trade-in), and a zero would read as "we paid
 * nothing for it" rather than "we do not know".
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { conditionLabel } from '@/lib/conditions';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveReceivingLineSerialsCsv } from '@/lib/receiving/receiving-line-serials';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * The unit-cost face — POSITIVE amounts only, mirroring `ReceivingPriceCell`'s
 * own rule. A missing or zero cost is an absent fact, not a free item.
 */
function unitPriceText(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolveReceivingSlotValue(
  row: ReceivingLineRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'receiving.order':
      return {
        kind: 'value',
        text: str(row.zoho_purchaseorder_number) ?? str(row.zoho_reference_number),
      };
    case 'receiving.status':
      return { kind: 'value', text: workflowStageLabel(row.workflow_status) };
    case 'receiving.qty':
      return { kind: 'value', text: String(row.quantity_received) };
    case 'receiving.price':
      return { kind: 'value', text: unitPriceText(row.unit_price) };
    case 'receiving.condition': {
      const grade = str(row.condition_grade);
      return { kind: 'value', text: grade ? conditionLabel(grade, 'compact') : null };
    }
    case 'receiving.location':
      return { kind: 'value', text: str(row.staging_location_label) };
    case 'receiving.tracking':
      return { kind: 'value', text: str(row.tracking_number) };
    case 'receiving.serial':
      return { kind: 'value', text: str(resolveReceivingLineSerialsCsv(row)) };
    case 'receiving.assigned_tech': {
      const id = Number(row.assigned_tech_id);
      return {
        kind: 'value',
        text: Number.isFinite(id) && id > 0 ? `#${id}` : null,
      };
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
export function receivingSlotValuesFor(
  row: ReceivingLineRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveReceivingSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
