/**
 * Admin drift-alert slot resolvers — pure.
 *
 * `triggered` resolves to the ABSOLUTE INSTANT, never to a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depends on `now` would
 * sort and search differently on every render.
 *
 * `worst_delta` resolves to the BARE number as text — no `+`, no `|Δ|` prefix.
 * The column's `slotDisplayType` is `number`, so `compareGridValues` parses
 * this text back into a number to order the column; a decorated face would
 * either fail to parse or sort as a string ("10" before "2"). The prefix is the
 * pill's paint, in `admin-drift-alerts-row-view.ts`.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { DriftAlertRow } from '@/lib/inventory/drift-rows';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveAdminDriftAlertsSlotValue(
  row: DriftAlertRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'admin-drift-alerts.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'admin-drift-alerts.worst_delta':
      return { kind: 'value', text: row.qty_at_trigger == null ? null : String(row.qty_at_trigger) };
    case 'admin-drift-alerts.triggered':
      return { kind: 'value', text: str(row.triggered_at) };
    case 'admin-drift-alerts.detail':
      return { kind: 'value', text: str(row.notes) };
    default:
      return null;
  }
}
