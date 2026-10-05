'use client';

/**
 * Paperwork intake — the rail card that files a packing slip or a manual
 * onto the paired order, through the order record's own paperwork writes
 * (`useOrderPaperworkActions`: `/documents/upload` for a slip, `/manuals` for
 * a manual, pinned to the order). The platform fetch pulls the marketplace's
 * own packing slip when the channel offers one. Filed paperwork appears in
 * the document strip at once (the same queries).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button } from '@/design-system/primitives';
import { FileText, Upload } from '@/components/Icons';
import { useOrderPaperworkActions } from '@/lib/orders/order-paperwork-client';
import type { LabelOrderLine } from '@/lib/label-prints/contracts';

const ACCEPT = 'application/pdf,image/*';

export function PaperworkIntakeCard({
  orderId,
  orderRef,
  lines,
  onFiled,
}: {
  orderId: number;
  orderRef: string | null;
  lines: readonly LabelOrderLine[];
  /** Filed or fetched paperwork changes the desk's Paperwork queue — the host re-reads it. */
  onFiled: () => void;
}) {
  const defaultLineId = lines.find((line) => line.orderLineId === orderId)?.orderLineId ?? lines[0]?.orderLineId ?? orderId;
  const [lineId, setLineId] = useState(defaultLineId);
  useEffect(() => setLineId(defaultLineId), [defaultLineId]);
  const orderActions = useOrderPaperworkActions(orderId, orderRef ?? String(orderId), onFiled);
  const manualActions = useOrderPaperworkActions(lineId, orderRef ?? String(orderId), onFiled);
  const slipPicker = useRef<HTMLInputElement>(null);
  const manualPicker = useRef<HTMLInputElement>(null);
  const lineOptions = useMemo(
    () => lines.map((line) => ({
      value: line.orderLineId,
      label: line.itemNumber ? `Item # ${line.itemNumber}` : line.sku ? `SKU ${line.sku}` : line.title,
      meta: line.title,
    })),
    [lines],
  );
  const busy = orderActions.upload.isPending || manualActions.upload.isPending || orderActions.fetchFromPlatform.isPending;

  const file = (kind: 'packing_slip' | 'manual', list: FileList | null) => {
    // Manuals default to the order's item number, then catalog SKU, and only
    // fall back to the order. Packing slips remain order documents.
    for (const picked of list ?? []) {
      (kind === 'manual' ? manualActions : orderActions).upload.mutate({ kind, file: picked });
    }
  };

  return (
    <RecordGroup title={`Order paperwork · ${orderRef ?? `#${orderId}`}`} testId="paperwork-intake-card">
      <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-1">
        <input ref={slipPicker} className="sr-only" type="file" accept={ACCEPT} multiple tabIndex={-1} aria-label="Packing slip files" onChange={(e) => { file('packing_slip', e.target.files); e.target.value = ''; }} />
        <input ref={manualPicker} className="sr-only" type="file" accept={ACCEPT} multiple tabIndex={-1} aria-label="Manual files" onChange={(e) => { file('manual', e.target.files); e.target.value = ''; }} />
        <Button variant="secondary" size="sm" radius="control" icon={<Upload />} disabled={busy} onClick={() => slipPicker.current?.click()}>
          Packing slip
        </Button>
        <Button variant="secondary" size="sm" radius="control" icon={<Upload />} disabled={busy} onClick={() => manualPicker.current?.click()}>
          Manual
        </Button>
        {lineOptions.length > 1 ? (
          <div className="col-span-2">
            <SearchableSelectField
              value={lineId}
              onChange={(value) => typeof value === 'number' && setLineId(value)}
              options={lineOptions}
              label="Manual belongs to"
              searchPlaceholder="Find an item number or product"
              ariaLabel="Product for this manual"
              appearance="flush"
            />
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          radius="control"
          className="col-span-2"
          icon={<FileText />}
          loading={orderActions.fetchFromPlatform.isPending}
          disabled={busy}
          onClick={() => orderActions.fetchFromPlatform.mutate(['packing_slip'])}
        >
          Fetch packing slip from the channel
        </Button>
      </div>
    </RecordGroup>
  );
}
