'use client';

import { ChevronsRight, Clock, ExternalLink, Printer, User } from '@/components/Icons';
import { MobileOrderPaperworkSheet } from '@/components/mobile/orders/MobileOrderPaperworkSheet';
import { ItemCardShipBy } from '@/components/mobile/redesign/ItemCardRow';
import { orderChannel } from '@/components/mobile/orders/OrderInfoCard';
import { useOrderDocuments, useOrderManuals } from '@/lib/orders/order-paperwork-client';
import { DetailDock } from '@/design-system/components/DetailDock';
import { getPlatformLabelByItemNumber, useExternalItemUrl } from '@/hooks/useExternalItemUrl';
import type { DirectedPickOrder, PickOwnerVia } from '@/lib/picking/directed-pick';

/** Why this pick is the viewer's, in words. */
const OWNER_VIA_LABEL: Record<PickOwnerVia, string> = {
  assigned: 'Assigned to you',
  sku: 'Your SKU',
  backup: 'Backup for this SKU',
};

type OrderVerb = 'documents' | 'listing' | 'skip' | 'pass';

/** The order the current line belongs to: */
export function DirectedPickOrderCard({
  order,
  tote,
  elapsed,
  docsOpen,
  setDocsOpen,
  viewerStaffId,
  busy,
  onSkip,
  onPass,
}: {
  order: DirectedPickOrder;
  tote: string | null;
  elapsed: string;
  docsOpen: boolean;
  setDocsOpen: (open: boolean) => void;
  viewerStaffId: number | null;
  busy: boolean;
  onSkip: () => void;
  onPass: () => void;
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
  const owner = order.owner;
  const ownership = !owner
    ? 'Unassigned'
    : owner.staffId === viewerStaffId
      ? OWNER_VIA_LABEL[owner.via]
      : `${owner.name ?? `Staff #${owner.staffId}`}'s pick`;
  const backups = order.backups.map((b) => b.name ?? `Staff #${b.staffId}`);

  return (
    <section aria-label="Order" className="border-b border-mode-rule bg-surface-card">
      <div className="px-mode-page py-2">
        <p className="break-words text-role-data text-text-muted">
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
        <p className="mt-1 break-words text-role-data text-text-muted">
          <span className="font-semibold text-text-default">{ownership}</span>
          {backups.length > 0 ? <> · Backups: {backups.join(', ')}</> : null}
        </p>
      </div>
      <DetailDock<OrderVerb>
        label="Order actions"
        placement="inline"
        verbs={[
          {
            id: 'documents',
            label: docsLabel,
            icon: <Printer />,
            disabled: documentsQuery.isError || manualsQuery.isError,
            loading: documentsQuery.isPending || manualsQuery.isPending,
          },
          {
            id: 'listing',
            label: listingHref ? `${getPlatformLabelByItemNumber(order.itemNumber)} listing` : 'No listing',
            icon: <ExternalLink />,
            disabled: !listingHref,
          },
          { id: 'skip', label: 'Skip', icon: <ChevronsRight />, disabled: busy },
          { id: 'pass', label: 'Pass to picker', icon: <User />, disabled: busy },
        ]}
        onVerb={(id) => {
          if (id === 'documents') setDocsOpen(true);
          else if (id === 'listing') openExternalByItemNumber(order.itemNumber);
          else if (id === 'skip') onSkip();
          else onPass();
        }}
      />
      <MobileOrderPaperworkSheet open={docsOpen} onClose={() => setDocsOpen(false)} orderId={order.orderId} orderRef={order.orderLabel} />
    </section>
  );
}
