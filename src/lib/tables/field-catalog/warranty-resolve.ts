/** Warranty slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { WARRANTY_STATUS_LABEL, type WarrantyClaimListRow } from '@/lib/warranty/types';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * The countdown face. `null` days is "No date" rather than a blank: a claim
 * whose clock has not started is a different thing from one with no cover left,
 * and the operator needs to tell them apart.
 */
export function warrantyClockLabel(daysRemaining: number | null): string {
  if (daysRemaining == null) return 'No date';
  if (daysRemaining < 0) return 'Expired';
  if (daysRemaining === 0) return 'Last day';
  return `${daysRemaining}d left`;
}

/** The item a claim is about — title, else the SKU, else the serial. */
export function warrantyClaimItemLabel(claim: WarrantyClaimListRow): string | null {
  return claim.productTitle || claim.sku || claim.serialNumber || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveWarrantySlotValue(
  claim: WarrantyClaimListRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'warranty.claim':
      return { kind: 'value', text: str(claim.claimNumber) };
    case 'warranty.serial':
      return { kind: 'value', text: str(claim.serialNumber) };
    case 'warranty.customer':
      return { kind: 'value', text: str(claim.customerName) };
    case 'warranty.status':
      return { kind: 'value', text: WARRANTY_STATUS_LABEL[claim.status] ?? claim.status };
    case 'warranty.clock':
      return { kind: 'value', text: warrantyClockLabel(claim.daysRemaining) };
    case 'warranty.ticket':
      // A claim with no ticket has not gone to support — a dash, never a `0`
      // or a "none" that would read as a linked ticket named none.
      return {
        kind: 'value',
        text: claim.zendeskTicketId == null ? null : `#${claim.zendeskTicketId}`,
      };
    case 'warranty.logged': {
      const raw = str(claim.createdAt);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    default:
      return null;
  }
}
