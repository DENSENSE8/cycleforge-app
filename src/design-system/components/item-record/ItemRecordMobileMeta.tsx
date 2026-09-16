'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { ITEM_RECORD_MOBILE_META } from '@/design-system/tokens/item-record-mobile';

/**
 * Phone item-record facts under the title — item number, then qty · price ·
 * condition · notes as ONE typographic row, same order as the desk compound
 * Item cell.
 *
 * Operator 2026-09-15: no middot separators. Whitespace does the separating,
 * so the three facts read as three values rather than a punctuated sentence,
 * and every one of them shares a single font — they differ only in ink.
 *
 * The item number leads because it is IDENTITY, not a fact: a picker matching
 * paper to screen reads the left edge first, and an identity that floats
 * between facts moves every time one of them is absent.
 */
export function ItemRecordMobileMeta({
  itemNumber,
  qty,
  price,
  condition,
  notes,
  className,
}: {
  itemNumber?: ReactNode;
  qty: ReactNode;
  price?: ReactNode;
  condition?: ReactNode;
  notes?: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-item-record-mobile-meta
      className={cn(ITEM_RECORD_MOBILE_META.cluster, className)}
    >
      {itemNumber ? (
        <span className={ITEM_RECORD_MOBILE_META.itemNumber}>{itemNumber}</span>
      ) : null}
      <span className={ITEM_RECORD_MOBILE_META.qty}>{qty}</span>
      {price ? <span className={ITEM_RECORD_MOBILE_META.price}>{price}</span> : null}
      {condition ? (
        <span className={ITEM_RECORD_MOBILE_META.condition}>{condition}</span>
      ) : null}
      {notes ? <span className={ITEM_RECORD_MOBILE_META.notes}>{notes}</span> : null}
    </span>
  );
}
