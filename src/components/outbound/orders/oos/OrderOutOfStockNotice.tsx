'use client';

/**
 * Out of stock — the order record's notice above the customer note (operator
 * 2026-10-08): what is short, plainly, and the one way back — Mark not out of
 * stock (Undo on its toast). Renders nothing while no line is short.
 */

import { AlertTriangle } from '@/components/Icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { useClearOutOfStock } from './useClearOutOfStock';

export function OrderOutOfStockNotice({ lines }: { lines: readonly ShippedOrder[] }) {
  const clearOutOfStock = useClearOutOfStock();
  const short = lines.filter((line) => Boolean(line.is_out_of_stock));
  if (short.length === 0) return null;
  return (
    <Alert variant="destructive" data-testid="order-record-oos-notice">
      <AlertTriangle aria-hidden />
      <AlertTitle className="text-role-data">Out of stock</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <ul className="flex flex-col gap-0.5">
          {short.map((line) => {
            const qty = Number(line.oos_qty_short);
            return (
              <li key={line.id} className="break-words">
                <span className="font-medium">{line.oos_title || line.product_title || 'This product'}</span>
                {line.oos_sku ? <span className="font-mono"> · {line.oos_sku}</span> : null}
                {Number.isFinite(qty) && qty > 0 ? <span> · {qty} short</span> : null}
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          data-testid="order-record-oos-clear"
          onClick={() => clearOutOfStock(short)}
        >
          Mark not out of stock
        </Button>
      </AlertDescription>
    </Alert>
  );
}
