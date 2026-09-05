'use client';

import type { ReactNode } from 'react';
import { ItemRecordMetaGrid } from '@/design-system/components/item-record';

/**
 * Named door for the shared six-track ledger. Pass-through only.
 * Location stays a slot so this door cannot drop a track.
 *
 * The two legacy flags are inert and stay that way: neither ever changed the
 * layout, and `unitsChrome` in particular must never collapse a track
 * (Arrival door-flow SKU face parity).
 */
export function PoLineMetaGrid({
  qty,
  sku,
  condition,
  serial,
  price,
  location,
  unitsChrome: _unitsChrome,
  indent: _indent,
  className,
}: {
  qty: ReactNode;
  sku?: ReactNode;
  condition?: ReactNode;
  serial?: ReactNode;
  price?: ReactNode;
  location?: ReactNode;
  /** @deprecated Host editor gate — never affected this layout. Ignored. */
  unitsChrome?: boolean;
  /** @deprecated Thumb is the left rail on the nested grid row. Ignored. */
  indent?: string;
  className?: string;
}) {
  return (
    <ItemRecordMetaGrid
      qty={qty}
      price={price}
      condition={condition}
      sku={sku}
      serial={serial}
      location={location}
      className={className}
    />
  );
}
