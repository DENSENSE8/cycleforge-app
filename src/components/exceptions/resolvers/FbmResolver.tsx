'use client';

import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { OrderNotesPanel } from '@/components/outbound/orders/notes/OrderNotesPanel';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { useResolveFbmException } from '@/hooks/exceptions';
import type { FbmExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { resolveWith, useExceptionsChanged } from './resolve-feedback';

/**
 * FBM — a held order, cleared by its category's own verb, in place:
 * Out of Stock → back in stock;
 * Shipping Issue → the order's parcel & label panel (rate-shop, buy, link).
 * The buyer's note reads like the Allocate record's (its "Customer note"
 * group, triage face). A verb that
 * clears the exception clears it at once (`clears`), before the server answers.
 */
export function FbmResolver({ row, facts }: { row: ExceptionRow; facts: FbmExceptionFacts }) {
  const { order } = facts;
  const resolve = useResolveFbmException();
  const changed = useExceptionsChanged();
  const orderRef = order.orderNumber || `order-${order.id}`;
  const category = order.routing.category;

  let action = null;
  if (category === 'Out of Stock') {
    action = (
      <Button
        variant="primary"
        loading={resolve.isPending}
        onClick={() =>
          resolveWith(resolve, { action: 'update-order', orderId: order.id, patch: { isOutOfStock: false }, clears: row.key }, `Order ${orderRef} back in stock`)
        }
        data-testid="exception-resolve-fbm"
      >
        {row.resolveVerb}
      </Button>
    );
  }

  const buyerNote = order.buyerNote?.trim() || null;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-fbm">
      {buyerNote ? (
        <RecordGroup title="Customer note" testId="exception-buyer-note">
          <div className="px-4 pb-3">
            <OrderNotesPanel
              key={`buyer:${order.id}`}
              orderId={order.id}
              buyerNote={buyerNote}
              accountSource={order.accountSource ?? null}
              latestNote={null}
              showBuyerNote
              showNote={false}
            />
          </div>
        </RecordGroup>
      ) : null}
      <RecordGroup title="Resolve">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex flex-col [&>*:last-child]:border-b-0">
            <EvidenceFactRow label="Category">{category}</EvidenceFactRow>
            <EvidenceFactRow label="Action">{order.routing.actionRequired}</EvidenceFactRow>
            <EvidenceFactRow label="Owner">
              {order.routing.owner}
              {order.responsiblePerson ? ` · ${order.responsiblePerson}` : ''}
            </EvidenceFactRow>
            {order.internalNote ? <EvidenceFactRow label="Internal note" wide>{order.internalNote}</EvidenceFactRow> : null}
          </div>
          {action ? <div className="flex justify-end">{action}</div> : null}
        </div>
      </RecordGroup>
      {category === 'Shipping Issue' ? (
        <RecordGroup title="Parcel & shipping label">
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            <OrderShippingPanel orderId={order.id} orderRef={orderRef} onFactsChanged={changed} testIdPrefix="exception" showDocuments={false} />
          </div>
        </RecordGroup>
      ) : null}
      {!action && category !== 'Shipping Issue' ? (
        <RecordGroup title="Next step">
          <EvidenceNotice>{order.routing.actionRequired} — {order.routing.owner} owns this hold.</EvidenceNotice>
        </RecordGroup>
      ) : null}
    </div>
  );
}
