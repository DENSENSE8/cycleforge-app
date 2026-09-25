'use client';

import { Clock, ExternalLink, Printer } from '@/components/Icons';
import { MobileOrderPaperworkSheet } from '@/components/mobile/orders/MobileOrderPaperworkSheet';
import { ItemCardShipBy } from '@/components/mobile/redesign/ItemCardRow';
import { orderChannel } from '@/components/mobile/orders/OrderInfoCard';
import { useOrderDocuments, useOrderManuals } from '@/lib/orders/order-paperwork-client';
import { Button } from '@/design-system/primitives';
import { getPlatformLabelByItemNumber, useExternalItemUrl } from '@/hooks/useExternalItemUrl';
import type { DirectedPickOrder } from '@/lib/picking/directed-pick';

/**
 * The order the current line belongs to: channel, deadline, remaining units,
 * tote and its attached paperwork. Listing opens the exact item URL in a new tab.
 */
export function DirectedPickOrderCard({
  order,
  tote,
  elapsed,
  docsOpen,
  setDocsOpen,
}: {
  order: DirectedPickOrder;
  tote: string | null;
  elapsed: string;
  docsOpen: boolean;
  setDocsOpen: (open: boolean) => void;
}) {
  const { getExternalUrlByItemNumber, openExternalByItemNumber } = useExternalItemUrl();
  const documentsQuery = useOrderDocuments(order.orderId);
  const manualsQuery = useOrderManuals(order.orderId);
  const documentCount = (documentsQuery.data?.documents.length ?? 0) + (manualsQuery.data?.manuals.length ?? 0);

  const channel = orderChannel(order.accountSource);
  const listingHref = getExternalUrlByItemNumber(order.itemNumber);
  const docsLabel = documentsQuery.isPending || manualsQuery.isPending
    ? 'Loading documents…'
    : documentsQuery.isError || manualsQuery.isError
      ? 'Documents unavailable'
      : `Documents · ${documentCount}`;

  return (
    <section aria-label="Order" className="mt-3 border border-border-soft bg-surface-card">
      <div className="px-4 pt-3">
        <p className="truncate text-role-data text-text-muted">
          {channel ? <>{channel} · </> : null}
          <span className="font-mono font-semibold text-text-default">{order.orderLabel}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ItemCardShipBy deadlineAt={order.deadlineAt} />
          <span className="text-role-caption text-text-muted">
            {order.unitsRemaining} {order.unitsRemaining === 1 ? 'unit' : 'units'} left in order
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-role-caption tabular-nums text-text-muted">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {elapsed}
          </span>
        </div>
        <p className="mt-2 text-role-data text-text-muted">
          {tote ? (
            <>
              Tote <span className="font-mono font-semibold text-text-default">{tote}</span>
            </>
          ) : (
            'No tote yet — picks land in the tote you scan'
          )}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-soft px-4 py-3">
        <Button
          variant="secondary"
          size="md"
          icon={<Printer />}
          disabled={documentsQuery.isError || manualsQuery.isError}
          loading={documentsQuery.isPending || manualsQuery.isPending}
          onClick={() => setDocsOpen(true)}
        >
          {docsLabel}
        </Button>
        <Button
          variant="secondary"
          size="md"
          icon={<ExternalLink />}
          disabled={!listingHref}
          onClick={() => openExternalByItemNumber(order.itemNumber)}
        >
          {listingHref ? `${getPlatformLabelByItemNumber(order.itemNumber)} listing` : 'No listing'}
        </Button>
      </div>
      <MobileOrderPaperworkSheet open={docsOpen} onClose={() => setDocsOpen(false)} orderId={order.orderId} orderRef={order.orderLabel} />
    </section>
  );
}
