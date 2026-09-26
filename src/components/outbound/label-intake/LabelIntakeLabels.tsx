'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer } from '@/components/Icons';
import { evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_TRAILING_CELL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { LEDGER_HIT_CLASS } from '@/components/outbound/orders/outbound-orders-ledger-geometry';
import { printDocument, orderLabelSummaryKey } from '@/lib/orders/order-paperwork-client';
import { LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import { cn } from '@/utils/_cn';
import {
  formatMoney,
  intakeLabelPdfSrc,
  labelIntakeKey,
  pairIntakeLabels,
  type IntakeLookup,
} from './label-intake-client';

function stamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The evidence column: every label already recorded under the typed number —
 * the order's own labels when it pairs, plus reference-only rows — and the
 * one verb that adopts reference rows onto the order once it exists.
 */
export function LabelIntakeLabels({ lookup }: { lookup: IntakeLookup | null }) {
  const queryClient = useQueryClient();
  const order = lookup?.order ?? null;
  const pair = useMutation({
    mutationFn: () => {
      if (!lookup || !order) throw new Error('Nothing to pair.');
      return pairIntakeLabels(lookup.ref, order.id);
    },
    onSuccess: () => {
      if (!lookup) return;
      void queryClient.invalidateQueries({ queryKey: labelIntakeKey(lookup.ref) });
      if (order) void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(order.id) });
    },
  });

  const labels = lookup?.labels ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="label-intake-labels">
      <div className={cn('flex shrink-0 items-center border-b border-mode-ink pl-4', LEDGER_HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'flex-1 truncate text-mode-muted')}>
          Labels{lookup ? ` · ${lookup.ref}` : ''}
        </span>
        <span className={cn(RECORD_LABEL_CLASS, 'px-4 tabular-nums text-mode-muted')}>{labels.length}</span>
      </div>

      {lookup && !order ? (
        <p className="border-b border-mode-rule px-4 py-2 text-role-data text-mode-muted">
          Not in the system. Labels are recorded under this number and pair to the order when it arrives.
        </p>
      ) : null}

      {lookup && order && lookup.unpairedCount > 0 ? (
        <div className="flex items-center gap-2 border-b border-mode-rule px-4 py-2">
          <span className="flex-1 text-role-data text-mode-ink">
            {lookup.unpairedCount} reference label{lookup.unpairedCount === 1 ? '' : 's'} not on order #{order.id}
          </span>
          <button
            type="button"
            className={evidenceVerbClass(true)}
            disabled={pair.isPending}
            onClick={() => pair.mutate()}
            data-testid="label-intake-pair"
          >
            Pair
          </button>
        </div>
      ) : null}
      {pair.isError ? (
        <p role="alert" className="border-b border-mode-rule px-4 py-2 text-role-data text-mode-warn">
          {pair.error.message}
        </p>
      ) : null}

      {labels.length === 0 ? (
        <p className="px-4 py-3 text-role-data text-mode-muted">{lookup ? 'No labels yet.' : 'Type an order number.'}</p>
      ) : (
        <ol className="flex flex-col">
          {labels.map((label) => (
            <li key={label.id} className="flex border-b border-mode-rule" data-testid="label-intake-label">
              <div className="min-w-0 flex-1 py-2 pl-4">
                <div className="flex items-center gap-2">
                  <span className={cn(RECORD_LABEL_CLASS, 'w-9 shrink-0 bg-mode-ink px-1 text-center text-mode-bar')}>
                    {LABEL_PURPOSE_FACE[label.purpose].code}
                  </span>
                  <span className={cn(RECORD_LABEL_CLASS, label.status === 'voided' ? 'text-mode-muted line-through' : 'text-mode-ink')}>
                    {label.status === 'voided' ? 'Voided' : LABEL_PURPOSE_FACE[label.purpose].label}
                  </span>
                  {!label.paired ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>Ref only</span> : null}
                  <span className={cn(RECORD_ID_CLASS, 'ml-auto shrink-0')}>{formatMoney(label.cost, label.currency)}</span>
                </div>
                <p className={cn(RECORD_ID_CLASS, 'mt-1 select-all break-all')}>{label.trackingNumber ?? '—'}</p>
                <p className="mt-0.5 truncate text-role-micro text-mode-muted">
                  {[label.carrierCode?.toUpperCase(), label.serviceCode?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || '—'}
                  {' · '}
                  {stamp(label.at)}
                  {label.actorName ? ` · ${label.actorName}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Print ${LABEL_PURPOSE_FACE[label.purpose].label.toLowerCase()} label ${label.trackingNumber ?? ''}`}
                disabled={!label.printable}
                onClick={() => printDocument(intakeLabelPdfSrc(label.id))}
                className={cn(
                  'ds-raw-button self-stretch border-l border-mode-edge text-mode-muted enabled:hover:bg-mode-hover enabled:hover:text-mode-ink disabled:opacity-30',
                  RECORD_TRAILING_CELL_CLASS,
                  focusRing('cell'),
                )}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
