/** Admin drift-alert slot resolvers — pure. */

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
