import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SkuVelocityRow } from '@/features/reports/metrics/report-rows';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveSkuVelocitySlotValue(
  row: SkuVelocityRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'sku-velocity.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'sku-velocity.product':
      return { kind: 'value', text: str(row.product_title) };
    case 'sku-velocity.tier':
      return { kind: 'value', text: str(row.velocity_tier) };
    case 'sku-velocity.out':
      return { kind: 'value', text: String(row.out_qty) };
    case 'sku-velocity.in':
      return { kind: 'value', text: String(row.in_qty) };
    case 'sku-velocity.stock':
      return { kind: 'value', text: String(row.current_stock) };
    default:
      return null;
  }
}

export function skuVelocitySlotValuesFor(
  row: SkuVelocityRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveSkuVelocitySlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
