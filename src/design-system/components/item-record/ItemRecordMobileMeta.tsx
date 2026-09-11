'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { ITEM_RECORD_MOBILE_META } from '@/design-system/tokens/item-record-mobile';

/**
 * Phone item-record facts under the title — qty · price · condition · notes
 * as one typographic row, same order as the desk compound Item cell.
 */
export function ItemRecordMobileMeta({
  qty,
  price,
  condition,
  notes,
  className,
}: {
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
      <span className={ITEM_RECORD_MOBILE_META.qty}>{qty}</span>
      {price ? (
        <>
          <span className={ITEM_RECORD_MOBILE_META.sep} aria-hidden>
            ·
          </span>
          <span className={ITEM_RECORD_MOBILE_META.price}>{price}</span>
        </>
      ) : null}
      {condition ? (
        <>
          <span className={ITEM_RECORD_MOBILE_META.sep} aria-hidden>
            ·
          </span>
          <span className={ITEM_RECORD_MOBILE_META.condition}>{condition}</span>
        </>
      ) : null}
      {notes ? (
        <>
          <span className={ITEM_RECORD_MOBILE_META.sep} aria-hidden>
            ·
          </span>
          {notes}
        </>
      ) : null}
    </span>
  );
}
