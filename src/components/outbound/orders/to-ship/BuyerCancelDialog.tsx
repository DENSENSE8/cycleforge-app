'use client';

/**
 * Buyer cancelled — the order verbs' centered dialog (operator 2026-10-08),
 * the same shape as Report out of stock and Pair SKU to location: what leaves
 * the list, then ONE confirm button, focused, so Enter confirms. The verb's own
 * key (Z) never confirms — a double press cannot cancel an order by accident.
 * The write itself shows Undo on the bottom-right toast.
 */

import { useEffect, useRef } from 'react';
import { Package, PackageX } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export function BuyerCancelDialog({
  rows,
  onConfirm,
  onCancel,
}: {
  rows: readonly ShippedOrder[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
  }, []);
  const orders = [...new Set(rows.map((row) => String(row.order_id ?? '').trim() || `#${row.id}`))];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="order-buyer-cancel-dialog">
      <p className="text-role-caption text-text-soft">
        {orders.length === 1 ? (
          <>
            Order <span className="font-mono text-text-default">{orders[0]}</span> leaves Allocate. Search keeps it as Buyer cancel.
          </>
        ) : (
          `${orders.length} orders leave Allocate. Search keeps them as Buyer cancel.`
        )}
      </p>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className="flex min-w-0 items-center gap-3 rounded-mode-control border border-border-soft px-3 py-2">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-mode-control bg-surface-canvas" aria-hidden>
              {row.catalog_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- catalog / Zoho proxy host
                <img src={row.catalog_image_url} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <Package className="size-5 text-text-faint" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-role-data text-text-default">{row.product_title || row.sku || 'Product'}</span>
              <span className="block font-mono text-role-micro text-text-soft">
                {[row.order_id, row.sku, row.quantity ? `×${row.quantity}` : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button
          ref={confirmRef}
          type="button"
          variant="danger"
          size="md"
          icon={<PackageX />}
          className="w-full"
          data-testid="order-buyer-cancel-confirm"
          onClick={onConfirm}
        >
          Mark buyer cancelled
        </Button>
        <p className="text-center text-role-micro text-text-soft">Enter confirms · Undo stays on the toast</p>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onCancel}>
          Keep the order
        </Button>
      </div>
    </div>
  );
}
