'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { ITEM_RECORD_MOBILE_META } from '@/design-system/tokens/item-record-mobile';

/**
 * Phone item-record facts under the title — quantity · price · condition, with an optional machine identity and notes, as ONE typographic row.
 * Operator 2026-09-15: no middot separators. Whitespace does the separating,
 */
export function ItemRecordMobileMeta({
  itemNumber,
  qty,
  price,
  condition,
  notes,
  identityPosition = 'leading',
  className,
}: {
  itemNumber?: ReactNode;
  qty: ReactNode;
  price?: ReactNode;
  condition?: ReactNode;
  notes?: ReactNode;
  /** Order rosters may place machine identity after quantity/price/condition. */
  identityPosition?: 'leading' | 'after-facts';
  className?: string;
}) {
  const identity = itemNumber ? (
    <span className={ITEM_RECORD_MOBILE_META.itemNumber}>{itemNumber}</span>
  ) : null;
  return (
    <span
      data-item-record-mobile-meta
      className={cn(ITEM_RECORD_MOBILE_META.cluster, className)}
    >
      {identityPosition === 'leading' ? identity : null}
      <span className={ITEM_RECORD_MOBILE_META.qty}>{qty}</span>
      {price ? <span className={ITEM_RECORD_MOBILE_META.price}>{price}</span> : null}
      {condition ? (
        <span className={ITEM_RECORD_MOBILE_META.condition}>{condition}</span>
      ) : null}
      {identityPosition === 'after-facts' ? identity : null}
      {notes ? <span className={ITEM_RECORD_MOBILE_META.notes}>{notes}</span> : null}
    </span>
  );
}
