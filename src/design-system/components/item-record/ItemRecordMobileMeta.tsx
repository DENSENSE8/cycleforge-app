'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { ITEM_RECORD_MOBILE_META } from '@/design-system/tokens/item-record-mobile';

/**
 * Phone item-record facts under the title — qty · condition · notes as one
 * cluster. Mount via `ds_tokens({ axis: 'item-record' })`. Do not split these
 * into independent chips, and do not add SKU / serial / price here (that is
 * {@link ItemRecordMetaGrid} on the desk).
 */
export function ItemRecordMobileMeta({
  qty,
  condition,
  notes,
  className,
}: {
  qty: ReactNode;
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
      {condition ? (
        <span className={ITEM_RECORD_MOBILE_META.condition}>{condition}</span>
      ) : null}
      {notes}
    </span>
  );
}
