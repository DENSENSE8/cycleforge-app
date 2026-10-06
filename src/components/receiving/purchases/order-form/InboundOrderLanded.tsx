'use client';

/**
 * What landed: the order (full id), what the writer did, its lines and
 * listing photos — with the ways on: open it in Purchasing or Deliveries, or
 * add another of the same type.
 */

import { useRouter } from 'next/navigation';
import { Check, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { INBOUND_ORDER_TYPE_LABELS } from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderLanding } from '@/lib/inbound/use-inbound-order-form';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';
import { INBOUND_FIND_PARAM } from '@/lib/receiving/inbound-lane';
import { cn } from '@/utils/_cn';

/** Deliveries — the Receiving lane door (predates the route tree). */
const DELIVERIES_PATH = '/incoming';

export function InboundOrderLanded({ landing, onAnother }: { landing: InboundOrderLanding; onAnother: () => void }) {
  const router = useRouter();
  const { result, photos } = landing;
  const orderNumber = result.identity.externalOrderId;
  const find = `?${INBOUND_FIND_PARAM}=${encodeURIComponent(orderNumber)}`;
  const typeLabel = INBOUND_ORDER_TYPE_LABELS[landing.type];
  const created = result.lines.filter((l) => l.created).length;
  const verdict = result.unchanged ? 'was already on file — nothing changed' : result.created ? 'landed' : 'was updated';
  return (
    <div className={cn(DESK_RECORD_COLUMN_CARD_CLASS, 'mx-auto my-8 max-w-xl items-center gap-4 px-6 py-10 text-center')} data-testid="inbound-order-landed">
      <span className="flex size-12 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
        <Check className="size-6" />
      </span>
      <h2 className="text-role-title font-semibold text-text-default">
        {typeLabel} <span className={RECORD_ID_CLASS}>{orderNumber}</span> {verdict}
      </h2>
      <p className="text-role-body text-text-muted">
        Inbound order {result.inboundOrderId} · {result.lines.length} line{result.lines.length === 1 ? '' : 's'}
        {created ? ` (${created} new)` : ''}
        {photos.uploaded ? ` · ${photos.uploaded} listing photo${photos.uploaded === 1 ? '' : 's'}` : ''}
        {photos.failed ? ` · ${photos.failed} photo${photos.failed === 1 ? '' : 's'} failed` : ''}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => router.push(`${RECEIVING_PATHS.purchasing}${find}`)} data-testid="inbound-landed-purchasing">
          Open in Purchasing
        </Button>
        <Button variant="secondary" onClick={() => router.push(`${DELIVERIES_PATH}${find}`)} data-testid="inbound-landed-deliveries">
          Open in Deliveries
        </Button>
        <Button variant="ink" icon={<Plus className="size-4" />} onClick={onAnother} autoFocus data-testid="inbound-landed-another">
          Add another
        </Button>
      </div>
    </div>
  );
}
