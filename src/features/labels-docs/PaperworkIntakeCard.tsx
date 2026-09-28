'use client';

/**
 * Paperwork intake — the rail card that files a packing slip or a manual
 * onto the paired order, through the order record's own paperwork writes
 * (`useOrderPaperworkActions`: `/documents/upload` for a slip, `/manuals` for
 * a manual, pinned to the order). The platform fetch pulls the marketplace's
 * own packing slip when the channel offers one. Filed paperwork appears in
 * the document strip at once (the same queries).
 */

import { useRef } from 'react';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { FileText, Upload } from '@/components/Icons';
import { useOrderPaperworkActions } from '@/lib/orders/order-paperwork-client';

const ACCEPT = 'application/pdf,image/*';

export function PaperworkIntakeCard({
  orderId,
  orderRef,
  onFiled,
}: {
  orderId: number;
  orderRef: string | null;
  /** Filed or fetched paperwork changes the desk's Paperwork queue — the host re-reads it. */
  onFiled: () => void;
}) {
  const actions = useOrderPaperworkActions(orderId, orderRef ?? String(orderId), onFiled);
  const slipPicker = useRef<HTMLInputElement>(null);
  const manualPicker = useRef<HTMLInputElement>(null);
  const busy = actions.upload.isPending || actions.fetchFromPlatform.isPending;

  const file = (kind: 'packing_slip' | 'manual', list: FileList | null) => {
    for (const picked of list ?? []) actions.upload.mutate({ kind, file: picked, ...(kind === 'manual' ? { pairTo: 'order' as const } : {}) });
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
        <Button
          variant="ghost"
          size="sm"
          radius="control"
          className="col-span-2"
          icon={<FileText />}
          loading={actions.fetchFromPlatform.isPending}
          disabled={busy}
          onClick={() => actions.fetchFromPlatform.mutate(['packing_slip'])}
        >
          Fetch packing slip from the channel
        </Button>
      </div>
    </RecordGroup>
  );
}
