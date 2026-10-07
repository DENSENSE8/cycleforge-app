'use client';

/** Leaf parts of the order pane's slots: the line identity, the uploaded-label search, the repin form host. */

import { useQuery } from '@tanstack/react-query';
import { Package, X } from '@/components/Icons';
import { RepairForm } from '@/components/outbound/orders/paperwork/PaperworkPairingControls';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { IconButton } from '@/design-system/primitives';
import { getLast8 } from '@/lib/copy-chip-format';
import { LABEL_INGESTIONS_QUERY_KEY, listLabelIngestionsHttp, type LabelIngestionDto } from '@/lib/label-ingestions/http-client';
import type { OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import { orderManualsQuery } from '@/lib/orders/order-paperwork-client';
import { cn } from '@/utils/_cn';
import { formatMonthDayTimePST } from '@/utils/date';
import { SLOT_STATE_FACE } from './slot-faces';

/** A line as the pane names it: photo, SKU-identity title, SKU · Item # · qty, and its slot state. */
export function LineIdentity({ line }: { line: OrderPacketLine }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <PhotoHoverPeek
        src={line.photoUrl}
        alt={line.title}
        className={cn('block size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-mode-rule', line.photoUrl ? 'bg-surface-card' : 'bg-mode-well')}
      >
        {line.photoUrl ? (
          <img src={line.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-text-faint" aria-hidden>
            <Package className="size-4" />
          </span>
        )}
      </PhotoHoverPeek>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 truncate text-role-data font-medium text-text-default" title={line.title}>
          {line.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
          {line.sku ? <span className="min-w-0 truncate font-mono" title={`SKU ${line.sku}`}>SKU {line.sku}</span> : null}
          {line.itemNumber ? <span className="min-w-0 truncate font-mono" title={`Item # ${line.itemNumber}`}>Item # {line.itemNumber}</span> : null}
          <span className="shrink-0 tabular-nums">×{line.quantity}</span>
        </span>
      </div>
      <LifecycleCode state={SLOT_STATE_FACE[line.state]} className="shrink-0" />
    </div>
  );
}

/** Search the uploaded labels still waiting for their order (quarantined, with a readable tracking number). */
export function UnpairedLabelPicker({
  pending,
  onPick,
  onClose,
  autoFocus = true,
}: {
  pending: boolean;
  onPick: (label: LabelIngestionDto) => void;
  onClose: () => void;
  /** Off where the picker opens on its own (the docs sheet) — focus there belongs to the sheet's keys. */
  autoFocus?: boolean;
}) {
  const waiting = useQuery({
    queryKey: [...LABEL_INGESTIONS_QUERY_KEY, 'state', 'QUARANTINED'],
    queryFn: () => listLabelIngestionsHttp('QUARANTINED'),
    staleTime: 15_000,
  });
  const options = (waiting.data ?? [])
    .filter((label) => label.trackingNumberNormalized)
    .map((label) => ({
      value: label.id,
      label: label.fileBasename,
      meta: [label.carrier, getLast8(label.trackingNumberNormalized), formatMonthDayTimePST(label.observedAt)].filter(Boolean).join(' · '),
      data: label,
    }));

  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5" data-testid="order-pane-label-pair-picker">
      <div className="min-w-0 flex-1">
        <SearchableSelectField
          value={null}
          onChange={(_value, option) => {
            if (option?.data) onPick(option.data);
          }}
          options={options}
          filter={(option, query) => {
            const q = query.trim().toLowerCase();
            const label = option.data;
            return !q || [label?.fileBasename, label?.trackingNumberNormalized, label?.trackingNumberRaw, label?.carrier]
              .some((text) => text?.toLowerCase().includes(q));
          }}
          loading={waiting.isFetching}
          disabled={pending}
          autoFocus={autoFocus}
          placeholder={pending ? 'Filing…' : 'Pick an uploaded label…'}
          searchPlaceholder="File name, tracking or carrier…"
          emptyMessage={waiting.isError ? 'Could not read the uploaded labels.' : 'No uploaded label is waiting for an order'}
          ariaLabel="Pair an uploaded label to this order"
          testId="order-pane-label-pair-select"
          className="w-full"
        />
      </div>
      <IconButton icon={<X />} size="sm" ariaLabel="Close the label search" onClick={onClose} />
    </div>
  );
}

/** Repin one manual: the paperwork card's `RepairForm`, fed the manual's full pinning from the line's manuals read. */
export function RepinPanel({
  line,
  manualId,
  orderRef,
  onSave,
  onCancel,
}: {
  line: OrderPacketLine;
  manualId: number;
  orderRef: string;
  onSave: Parameters<typeof RepairForm>[0]['onSave'];
  onCancel: () => void;
}) {
  const manuals = useQuery(orderManualsQuery(line.orderLineId));
  const manual = manuals.data?.manuals.find((row) => row.id === manualId) ?? null;
  return (
    <div className="mt-2 min-w-0 rounded-mode-control border border-mode-rule" data-testid="line-paperwork-repin-panel">
      {manual ? (
        <RepairForm manual={manual} orderId={line.orderLineId} orderRef={orderRef} onSave={onSave} onCancel={onCancel} />
      ) : (
        <p className="px-2 py-2 text-role-caption text-text-muted">
          {manuals.isError ? manuals.error.message : manuals.isPending ? 'Reading its pinning…' : 'It no longer resolves for this line.'}
        </p>
      )}
    </div>
  );
}
