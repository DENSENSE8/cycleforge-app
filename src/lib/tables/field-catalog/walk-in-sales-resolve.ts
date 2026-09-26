/** Walk-in-sales slot resolvers — row + fieldId → display fact. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { SaleRow } from '@/lib/walk-in/transactions';
import { formatCentsToDollars } from '@/lib/square/client';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function walkInSaleLineSummary(row: SaleRow): string | null {
  const items = row.line_items ?? [];
  if (items.length === 0) return null;
  const shown = items
    .slice(0, 2)
    .map((li) => `${li.quantity}× ${li.name}`)
    .join(', ');
  const more = items.length > 2 ? ` +${items.length - 2}` : '';
  return `${shown}${more}`;
}

export function resolveWalkInSalesSlotValue(
  row: SaleRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'walk-in-sales.id':
      return { kind: 'value', text: str(row.id) };
    case 'walk-in-sales.customer':
      return { kind: 'value', text: str(row.customer_name) ?? 'Walk-in' };
    case 'walk-in-sales.detail':
      return { kind: 'value', text: walkInSaleLineSummary(row) };
    case 'walk-in-sales.amount':
      return {
        kind: 'value',
        text: row.total != null ? formatCentsToDollars(row.total) : null,
      };
    case 'walk-in-sales.status':
      return { kind: 'value', text: str(row.status) };
    case 'walk-in-sales.created':
      return { kind: 'value', text: str(row.created_at) };
    case 'walk-in-sales.source':
      return { kind: 'value', text: str(row.order_source) };
    default:
      return null;
  }
}
