'use client';

import { useState } from 'react';
import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { PaperworkDocuments, type PaperworkTab } from '@/components/outbound/orders/paperwork/PaperworkDocuments';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Checkbox } from '@/design-system/primitives';
import { useResolvePaperworkException } from '@/hooks/exceptions';
import type { PaperworkExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { resolveWith, useExceptionsChanged } from './resolve-feedback';

/**
 * Paperwork — the order fails release gate G2 (documents) and / or G3
 * (shipping label). The SAME pieces the To-ship paperwork editor
 * (`PaperworkEditor`) composes, in place: the order's documents (upload,
 * replace, fetch from the platform, pair a manual) with the "does not need
 * manuals" exemption for G2, and the parcel & label panel for G3.
 */
export function PaperworkResolver({ facts }: { row: ExceptionRow; facts: PaperworkExceptionFacts }) {
  const { order } = facts;
  const orderRef = order.orderNumber || `order-${order.id}`;
  const resolve = useResolvePaperworkException();
  const changed = useExceptionsChanged();
  const needsDocuments = facts.missing.includes('documents');
  const needsLabel = facts.missing.includes('label');
  const [docTab, setDocTab] = useState<PaperworkTab>(needsDocuments ? 'manual' : 'shipping_label');
  const [exempt, setExempt] = useState(facts.docsNotRequired);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-paperwork">
      <RecordGroup title="Release gates">
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="Documents">
            {needsDocuments ? <span className="text-mode-warn">Missing</span> : facts.hasDocuments ? 'Linked' : 'Exempt'}
          </EvidenceFactRow>
          <EvidenceFactRow label="Label">
            {needsLabel ? <span className="text-mode-warn">Not linked or bought</span> : 'Linked'}
          </EvidenceFactRow>
        </div>
      </RecordGroup>
      <RecordGroup title="Paperwork">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <PaperworkDocuments orderId={order.id} orderRef={orderRef} tab={docTab} onTabChange={setDocTab} onChanged={changed} />
          {needsDocuments || exempt ? (
            <label className="flex items-center gap-2 border-t border-mode-rule pt-3 text-role-data text-mode-ink">
              <Checkbox
                checked={exempt}
                disabled={resolve.isPending}
                onCheckedChange={(next) => {
                  const value = next === true;
                  setExempt(value);
                  resolveWith(
                    resolve,
                    { action: 'docs-not-required', orderId: order.id, value },
                    value ? `${orderRef} needs no manuals` : `${orderRef} needs its manuals again`,
                  );
                }}
                data-testid="exception-paperwork-docs-not-required"
              />
              This order does not need manuals
            </label>
          ) : null}
        </div>
      </RecordGroup>
      {needsLabel ? (
        <RecordGroup title="Parcel & shipping label">
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            <OrderShippingPanel orderId={order.id} orderRef={orderRef} onFactsChanged={changed} testIdPrefix="exception" showDocuments={false} />
          </div>
        </RecordGroup>
      ) : null}
    </div>
  );
}
