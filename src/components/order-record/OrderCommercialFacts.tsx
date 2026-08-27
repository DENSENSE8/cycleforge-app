'use client';

/**
 * Sale amount + buyer note for an order — the two facts that lived ONLY on the
 * deleted `/search` facts column (2026-08-20 station port).
 *
 * Composes the `order-record` family atoms (`OrderFactList` / `OrderFactRow`),
 * so any order surface can mount it. It exists because the facts audit found
 * these two had no other renderer in the tree — `ShippedDetailsPanelContent`
 * covers item / platform / tracking / pipeline, and customer contact facts
 * have their own live renderer in `CustomerDetailsTab`, but nothing rendered
 * sale amount or buyer note on a record surface.
 *
 * It had a sibling, `OrderCustomerFacts`, deleted 2026-08-21. That one was NOT
 * a peer of this file: it was a fork of `CustomerDetailsTab`
 * (`src/components/shipped/CustomerDetailsTab.tsx`) — same `/api/customers/:id`
 * query, byte-identical `fullName` / `addressLines` helpers, same four fields —
 * so its facts always had a renderer and it lost its only mount when the
 * `/search` facts column was deleted. That difference is the whole test for a
 * component with no importers: ask whether the FACTS are orphaned, not whether
 * the component is. Re-mounting customer contact on a surface that lacks it
 * means mounting `CustomerDetailsTab`, never re-forking it here.
 *
 * **Both rows go through the atom** (2026-08-21). The buyer note used to
 * hand-roll `OrderFactRow`'s own `dt`/`dd` classes byte-for-byte purely to get
 * `whitespace-pre-line`; that is now the atom's `preserveLines` prop. Money
 * goes through `formatSalePrice`, not string concatenation.
 *
 * Fees and net payout are deliberately absent rather than painted as permanent
 * em dashes: the old column hardcoded them to `null` beside a "not reconciled"
 * note, which teaches a field the app cannot yet fill. When a commercial
 * document is linked, they become real rows here.
 */

import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { formatSalePrice } from '@/components/dashboard/orders-queue/helpers';
import type { ShippedOrder } from '@/types/orders';

export function OrderCommercialFacts({ order }: { order: ShippedOrder }) {
  // `formatSalePrice` is the money SoT — `Intl.NumberFormat` with the order's
  // own currency, falling back to `$0.00`. The hand-rolled
  // `${currency} ${amount}` this replaced printed `USD 1234.5`.
  const sale = formatSalePrice(order.sale_amount, order.currency);
  const buyerNote = String(order.buyer_note ?? '').trim();

  if (!sale && !buyerNote) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="order-commercial-facts">
      <OrderFactList cols={2}>
        {sale ? <OrderFactRow label="Sale amount" value={sale} mono /> : null}
        {/* `preserveLines` rather than a forked dt/dd pair: the buyer's own
            line breaks are the only thing this cell needed that the atom
            lacked, so the atom grew instead. */}
        {buyerNote ? (
          <OrderFactRow label="Buyer note" value={buyerNote} span preserveLines />
        ) : null}
      </OrderFactList>
    </div>
  );
}
