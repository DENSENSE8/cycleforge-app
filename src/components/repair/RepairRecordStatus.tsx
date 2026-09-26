'use client';

/**
 * The repair record's STATUS STRIP — the at-a-glance head of
 * {@link RepairRecordView}: current status and since when / by whom, price,
 * the Zendesk link, loud alerts, and the pipeline with each step's who / when
 * from the row's own stamps and `status_history`. Unstamped steps read `—`.
 */

import type { RepairStatusHistoryEntry, RSRecord } from '@/lib/neon/repair-service-queries';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  stateBadgeClass,
} from '@/design-system/tokens/industrial-record';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { repairStatusHue, repairStatusOperatorLabel } from '@/lib/repair-status';
import { currentStatusEntry, pickupEntry } from '@/lib/repair/repair-history';
import { repairPriceDisplay, repairTicketValue } from '@/lib/tables/field-catalog/repair-resolve';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { REPAIR_RECORD_COLUMN_CLASS, REPAIR_RECORD_LINK_CLASS } from './repair-record-sections';

const PAYMENT_DUE_STATUSES: Record<string, true> = {
  'Awaiting Payment': true,
  'Awaiting Additional Parts Payment': true,
};

interface PipelineStep {
  id: string;
  label: string;
  at: string | null;
  who: string | null;
  current: boolean;
}

/** Latest history entry that put the repair into one of `statuses`. */
function latestEntry(history: readonly RepairStatusHistoryEntry[], statuses: readonly string[]): RepairStatusHistoryEntry | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (statuses.includes(history[i].status)) return history[i];
  }
  return null;
}

/**
 * The repair's pipeline from its own stamps. Intake stamps come from the row;
 * the work steps from `status_history`. Delivered / received only paint when
 * the row carries them (a walk-in is never "delivered").
 */
function repairPipeline(repair: RSRecord, staffName: (id: number | null | undefined) => string): PipelineStep[] {
  const history = repair.status_history ?? [];
  const status = repair.status || '';
  const opening = history[0] && !history[0].previous_status ? history[0] : null;
  const steps: PipelineStep[] = [
    { id: 'intake', label: 'Checked in', at: repair.created_at || null, who: opening?.user_name ?? null, current: false },
  ];
  if (repair.delivered_at) {
    steps.push({ id: 'delivered', label: 'Delivered', at: repair.delivered_at, who: null, current: status === 'Incoming Shipment' });
  }
  if (repair.received_at) {
    steps.push({
      id: 'received',
      label: 'Received',
      at: repair.received_at,
      who: repair.received_by_staff_id ? staffName(repair.received_by_staff_id) : null,
      current: false,
    });
  }
  steps.push({ id: 'label', label: 'Label printed', at: repair.label_printed_at ?? null, who: null, current: false });

  const work: Array<{ id: string; label: string; statuses: readonly string[] }> = [
    { id: 'repair', label: 'In repair', statuses: ['Pending Repair', 'Awaiting Parts', 'Awaiting Additional Parts Payment'] },
    { id: 'repaired', label: 'Repaired', statuses: ['Repaired, Contact Customer'] },
    { id: 'ready', label: 'Ready for pickup', statuses: ['Awaiting Pickup', 'Awaiting Payment'] },
  ];
  for (const step of work) {
    const entry = latestEntry(history, step.statuses);
    steps.push({
      id: step.id,
      label: step.label,
      at: entry?.timestamp ?? null,
      who: entry?.user_name ?? null,
      current: step.statuses.includes(status),
    });
  }
  const pickup = pickupEntry(repair);
  const closed = pickup ?? latestEntry(history, ['Picked Up', 'Shipped', 'Done']);
  steps.push({
    id: 'closed',
    label: pickup ? 'Picked up' : closed?.status === 'Shipped' ? 'Shipped' : 'Closed',
    at: closed?.timestamp ?? null,
    who: closed?.user_name ?? null,
    current: ['Picked Up', 'Shipped', 'Done'].includes(status),
  });
  return steps;
}

interface StatusAlert {
  id: string;
  tone: StateName;
  text: string;
}

function repairAlerts(repair: RSRecord, zendeskUrl: string | null): StatusAlert[] {
  const alerts: StatusAlert[] = [];
  const status = repair.status || '';
  if (status === 'Cancelled') {
    alerts.push({ id: 'cancelled', tone: 'danger', text: 'Cancelled — hidden from every queue' });
  }
  if (PAYMENT_DUE_STATUSES[status]) {
    const price = repairPriceDisplay(repair);
    alerts.push({ id: 'payment', tone: 'danger', text: price ? `Payment due · ${price}` : 'Payment due · no price set' });
  }
  if (!repair.label_printed_at) {
    alerts.push({ id: 'label', tone: 'warning', text: 'Label not printed' });
  }
  if (!zendeskUrl) {
    alerts.push({ id: 'zendesk', tone: 'warning', text: 'No Zendesk ticket linked' });
  }
  return alerts;
}

export function RepairStatusStrip({ repair, zendeskUrl }: { repair: RSRecord; zendeskUrl: string | null }) {
  const { getStaffName } = useStaffNameMap();
  const status = repair.status || '';
  // The stored status's canonical hue as a state tone; neutral paints plain ink.
  const hue = repairStatusHue(status);
  const tone: StateName | null = hue === 'neutral' ? null : hue;
  const since = currentStatusEntry(repair);
  const price = repairPriceDisplay(repair);
  const steps = repairPipeline(repair, getStaffName);
  const currentIndex = steps.findIndex((step) => step.current);
  const alerts = repairAlerts(repair, zendeskUrl);

  return (
    <section aria-label="Repair status" data-testid="repair-record-status" className={cn(REPAIR_RECORD_COLUMN_CLASS, 'mb-4')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mode-ink px-4 py-2">
        <span className="flex items-center gap-2" data-testid="repair-record-state" data-status={status}>
          <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0', tone ? STATE_TONE_CLASSES[tone].dot : 'bg-mode-muted')} />
          <span className={cn('font-mono text-role-body font-black uppercase tracking-tight', tone ? STATE_TONE_CLASSES[tone].text : 'text-mode-ink')}>
            {status ? repairStatusOperatorLabel(status) : 'No status'}
          </span>
        </span>
        {since ? (
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            since {formatMonthDayTimePST(since.timestamp)}
            {since.user_name ? ` · ${since.user_name}` : ''}
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            Price{' '}
            <span className={cn(price ? RECORD_PRICE_CLASS : RECORD_ID_CLASS, 'normal-case tracking-normal', !price && 'text-mode-warn')}>
              {price ?? 'not set'}
            </span>
          </span>
          {zendeskUrl ? (
            <a
              href={zendeskUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="repair-record-zendesk"
              className={cn(RECORD_LABEL_CLASS, REPAIR_RECORD_LINK_CLASS)}
            >
              Zendesk #{repairTicketValue(repair)} ↗
            </a>
          ) : null}
        </span>
      </div>
      {alerts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-mode-ink px-4 py-2" data-testid="repair-record-alerts">
          {alerts.map((alert) => (
            <span key={alert.id} role="status" data-alert={alert.id} className={cn(RECORD_LABEL_CLASS, stateBadgeClass(alert.tone))}>
              {alert.text}
            </span>
          ))}
        </div>
      ) : null}
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]" data-testid="repair-record-pipeline">
        {steps.map((step, index) => {
          // A stamp past the current step was superseded (the repair moved
          // back, e.g. reopened after Closed): it keeps its time, faint.
          const done = step.at != null && (currentIndex < 0 || index <= currentIndex);
          const superseded = step.at != null && !done;
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-done={done ? '' : undefined}
              data-current={step.current ? '' : undefined}
              title={superseded ? 'Earlier stamp — the repair has since moved back' : undefined}
              className={cn('flex min-w-0 flex-col gap-0.5 border-r border-mode-edge px-3 py-2 last:border-r-0', step.current && 'bg-mode-panel')}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    'h-2 w-2 shrink-0',
                    step.current ? (tone ? STATE_TONE_CLASSES[tone].dot : 'bg-mode-ink') : done ? STATE_TONE_CLASSES.success.dot : 'bg-mode-edge',
                  )}
                />
                <span className={cn(RECORD_LABEL_CLASS, done || step.current ? 'text-mode-ink' : 'text-mode-muted')}>{step.label}</span>
              </span>
              <span className={cn('truncate text-role-data', done ? 'text-mode-ink' : 'text-mode-faint')}>
                {step.at ? formatMonthDayTimePST(step.at) : '—'}
              </span>
              {step.who ? <span className="truncate text-role-data text-mode-muted">{step.who}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
