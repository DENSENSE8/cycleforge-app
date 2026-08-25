'use client';

import type { ReactNode } from 'react';
import { ItemRecordMetaGrid } from '@/design-system/components/item-record';

/**
 * Boxed meta sub-grid for PO line rows — the receiving name for the shared
 * five-track ledger, whose implementation moved to
 * `design-system/components/item-record` (2026-08-22).
 *
 * Kept as a named door because the tech shipping rows compose the same grid
 * without being PO lines. The two legacy flags are inert and stay that way:
 * neither ever changed the layout, and `unitsChrome` in particular must never
 * collapse a track (Arrival door-flow SKU face parity).
 */
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
