import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { DeadStockRow } from '@/features/reports/metrics/report-rows';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveDeadStockSlotValue(
  row: DeadStockRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'dead-stock.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'dead-stock.product':
      return { kind: 'value', text: str(row.product_title) };
    case 'dead-stock.days':
      return { kind: 'value', text: String(row.days_dormant) };
    case 'dead-stock.stock':
      return { kind: 'value', text: String(row.stock) };
    default:
      return null;
  }
}

export function deadStockSlotValuesFor(
  row: DeadStockRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveDeadStockSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
