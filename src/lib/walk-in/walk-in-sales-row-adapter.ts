/** `SaleRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { formatCentsToDollars } from '@/lib/square/client';
import { walkInSaleLineSummary } from '@/lib/tables/field-catalog/walk-in-sales-resolve';
import type { SaleRow } from '@/lib/walk-in/transactions';

function civilFace(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMM d');
}

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

function statusTone(status: string): CompoundStateTone {
  const s = status.trim().toUpperCase();
  if (s === 'COMPLETED' || s === 'CAPTURED' || s === 'PAID') return 'done';
  if (s === 'FAILED' || s === 'CANCELED' || s === 'CANCELLED' || s === 'VOIDED') {
    return 'alert';
  }
  return 'neutral';
}

export function walkInSaleCompoundView(row: SaleRow): CompoundRowView {
  const when = civilFace(row.created_at);
  const whenKey = dateKey(row.created_at);
  const customer = String(row.customer_name ?? '').trim() || 'Walk-in';
  const lines = walkInSaleLineSummary(row);

  return {
    id: row.id,
    thumbUrl: null,
    title: customer,
    note: lines,
    orderId: row.id,
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: when
      ? {
          label: when,
          tip: `Completed ${when}`,
          dateKey: whenKey,
        }
      : null,
    ...(when ? { startedHover: `Completed ${when}` } : null),
    stateLabel: String(row.status ?? '').trim() || 'Open',
    stateTone: statusTone(row.status ?? ''),
    delay: null,
    amount: row.total != null ? formatCentsToDollars(row.total) : null,
  };
}
