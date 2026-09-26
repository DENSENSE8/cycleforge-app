'use client';

import type { ReactNode } from 'react';
import { ItemRecordMetaGrid } from '@/design-system/components/item-record';

/** Boxed meta sub-grid for PO line rows — the receiving name for the shared five-track ledger, whose implementation moved to… */
export function PoLineMetaGrid({
  qty,
  sku,
  condition,
  serial,
  price,
  unitsChrome: _unitsChrome,
  indent: _indent,
  className,
}: {
  qty: ReactNode;
  sku?: ReactNode;
  condition?: ReactNode;
  serial?: ReactNode;
  price?: ReactNode;
  /** @deprecated Host editor gate — never affected this layout. Ignored. */
  unitsChrome?: boolean;
  /** @deprecated Thumb is the left rail on the nested grid row. Ignored. */
  indent?: string;
  className?: string;
}) {
  return (
    <ItemRecordMetaGrid
      qty={qty}
      sku={sku}
      condition={condition}
      serial={serial}
      price={price}
      className={className}
    />
  );
}
