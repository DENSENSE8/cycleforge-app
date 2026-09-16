'use client';

/**
 * `/m/work` to-ship card — a thin `WorkOrderRow` adapter over the shared
 * {@link ItemCardRow}.
 *
 * The card's anatomy (photo, title, ship-by corner, one-font meta, listing
 * inset, CTA) is the ONE item card both queues paint (operator 2026-09-15);
 * this module only decides what the to-ship feed maps onto it and what its
 * CTA commits: Ship, with swipe-to-commit enabled.
 */

import { useCallback } from 'react';
import { Truck } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import type { WorkOrderRow } from '@/components/work-orders/types';
import { isToShipOutOfStock } from '@/lib/work-orders/to-ship-assignment';
import { toShipConditionParts, toShipExpectedQty, toShipPriceText } from './to-ship-faces';

export function MobileToShipRow({
  row,
  blocked = false,
  onOpen,
  onProcess,
}: {
  row: WorkOrderRow;
  resolveName: (id: number) => string;
  blocked?: boolean;
  onOpen: (row: WorkOrderRow) => void;
  onProcess: (row: WorkOrderRow) => void;
}) {
  const isBlocked = blocked || isToShipOutOfStock(row);

  const process = useCallback(() => {
    if (isBlocked) return;
    onProcess(row);
  }, [isBlocked, onProcess, row]);

  const openSheet = useCallback(() => onOpen(row), [onOpen, row]);

  return (
    <ItemCardRow
      title={row.title}
      imageUrl={row.imageUrl}
      // No item number on the face (operator 2026-09-15 — identical to the
      // pick card; the to-ship sheet carries it). It still resolves the
      // listing href.
      listingHref={getExternalUrlByItemNumber(row.itemNumber || row.sku)}
      qty={toShipExpectedQty(row)}
      price={toShipPriceText(row)}
      condition={toShipConditionParts(row)}
      deadlineAt={row.deadlineAt}
      onOpen={openSheet}
      ariaLabel={row.title}
      primary={{
        label: 'Ship',
        icon: <Truck />,
        disabled: isBlocked,
        onCommit: process,
      }}
      swipe
    />
  );
}
