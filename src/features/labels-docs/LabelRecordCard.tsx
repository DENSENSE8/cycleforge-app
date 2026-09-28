'use client';

/**
 * The label's record — the rail's last group: what the ledger knows (tracking,
 * carrier, order, status, arrival, file), its print log, and the one ledger
 * action its state permits (Apply to packed units / Reprocess), top-right.
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { LEDGER_ACTION_LABEL, ledgerStatus, quarantineCopy } from '@/lib/label-ingestions/ledger-view';
import type { LabelPrintRow } from '@/lib/label-prints/contracts';
import { fetchLabelPrintHistory, labelPrintHistoryKey } from '@/lib/label-prints/http-client';
import { cn } from '@/utils/_cn';
import { CHANNEL_FACE } from './print-faces';

const WHEN = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Fact({ term, children, mono }: { term: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2 px-4 py-1">
      <dt className={cn(RECORD_LABEL_CLASS, 'text-mode-faint')}>{term}</dt>
      <dd className={cn('min-w-0 break-words text-role-caption text-mode-ink', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

export function LabelRecordCard({
  row,
  actionRunning,
  onAction,
}: {
  row: LabelPrintRow;
  actionRunning: boolean;
  onAction: (row: LabelPrintRow, action: 'apply' | 'retry') => void;
}) {
  const history = useQuery({
    queryKey: labelPrintHistoryKey(row.id),
    queryFn: () => fetchLabelPrintHistory(row.id),
    enabled: row.printCount > 0,
  });
  const status = ledgerStatus(row.state);
  const action = status.action;
  const reason = quarantineCopy(row.quarantineReasonCode, row.trackingNumber != null);

  return (
    <RecordGroup
      title={`Label record · #${String(row.id).padStart(5, '0')}`}
      testId="label-record-card"
      className="pb-2"
      action={
        action ? (
          <Button variant="secondary" size="sm" radius="control" loading={actionRunning} onClick={() => onAction(row, action)}>
            {LEDGER_ACTION_LABEL[action]}
          </Button>
        ) : undefined
      }
    >
      <dl>
        <Fact term="Tracking" mono>{row.trackingNumber ?? 'Not read'}</Fact>
        <Fact term="Carrier">{row.carrier ?? '—'}</Fact>
        <Fact term="Order">{row.orderId != null ? `Paired · ${row.orderRef ?? `#${row.orderId}`}` : 'No order'}</Fact>
        <Fact term="Status">{reason ?? status.label}</Fact>
        <Fact term="Source">{row.source === 'SHIPSTATION_API' ? 'ShipStation' : row.source === 'MANUAL_UPLOAD' ? 'Uploaded PDF' : row.source.toLowerCase()}</Fact>
        <Fact term="File" mono>{row.fileBasename}</Fact>
        <Fact term="Arrived">{WHEN.format(new Date(row.observedAt))}</Fact>
        <Fact term="Printed">
          {row.printCount === 0
            ? 'Never'
            : `${row.printCount}× · last ${WHEN.format(new Date(row.lastPrintedAt ?? row.observedAt))}${row.lastPrintedBy ? ` · ${row.lastPrintedBy}` : ''}`}
        </Fact>
      </dl>
      {row.printCount > 0 ? (
        <div className="mt-1 border-t border-mode-divide pt-1">
          <p className={cn(RECORD_LABEL_CLASS, 'px-4 py-1 text-mode-muted')}>Print log</p>
          <ol className="max-h-40 divide-y divide-mode-divide overflow-y-auto">
            {(history.data ?? []).map((event) => (
              <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-4 py-1 text-role-caption">
                <span className="truncate text-mode-ink">
                  {event.isReprint ? 'Reprint' : 'Print'} · {CHANNEL_FACE[event.channel]}
                  {event.printerName ? ` · ${event.printerName}` : ''}
                </span>
                <time dateTime={event.printedAt} className="tabular-nums text-mode-muted">{WHEN.format(new Date(event.printedAt))}</time>
                <span className="col-span-2 truncate text-mode-faint">{event.printedBy ?? 'Unknown staff'}</span>
              </li>
            ))}
            {history.isPending ? <li className="px-4 py-1 text-role-caption text-mode-faint">Reading log</li> : null}
          </ol>
        </div>
      ) : null}
    </RecordGroup>
  );
}
