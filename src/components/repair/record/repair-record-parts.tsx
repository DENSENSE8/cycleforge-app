'use client';

/**
 * The repair record's leaf sections — the status-point rail, the carrier rail,
 * alerts, status history, linked support tickets and the serial editor —
 * composed by {@link RepairServiceRecordView}.
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Check,
  DoorOpen,
  ListChecks,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Tag,
  Truck,
  Wrench,
} from '@/components/Icons';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { RecordFlowFacts, RecordFlowSection } from '@/design-system/components/RecordFlowFacts';
import { TicketLink } from '@/components/receiving/record/inbound-record-model';
import { CarrierEventsRail } from '@/design-system/components/record-ledger/CarrierEventsRail';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LatestEdgeScroller } from '@/design-system/components/record-ledger/LatestEdgeScroller';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { StepRail, type RailStep } from '@/design-system/components/record-ledger/StepRail';
import { Button, TextField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { RepairLifecycleStep } from '@/design-system/tokens/repair-lifecycle';
import { repairCarrierEventsQuery } from '@/lib/queries/carrier-events-query';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { REPAIR_CHANNEL_LABEL } from '@/lib/repair/repair-channel';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import type { RepairRecordModel, RepairRecordStep } from '@/lib/repair/repair-record-model';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatPhoneNumber } from '@/utils/phone';
import { cn } from '@/utils/_cn';
import { useRepairLinkedTickets } from './RepairTicketPanels';

/** Each status point's glyph — the icon-per-step grammar of the inbound and outbound ladders. */
const STEP_ICON: Readonly<Record<RepairLifecycleStep, ReactNode>> = {
  checkedIn: <ListChecks aria-hidden />,
  received: <DoorOpen aria-hidden />,
  labeled: <Tag aria-hidden />,
  inRepair: <Wrench aria-hidden />,
  repaired: <PackageCheck aria-hidden />,
  awaitingPayment: <AlarmClock aria-hidden />,
  ready: <Package aria-hidden />,
  closed: <Check aria-hidden />,
};

const UNSTAMPED: Readonly<Record<'pending' | 'skipped', string>> = { pending: 'Not yet', skipped: 'Not recorded' };

function stepMeta(step: RepairRecordStep): string {
  const stamp = [step.who ? `By ${step.who}` : null, step.at ? formatMonthDayTimePST(step.at) : null].filter(Boolean).join(' · ');
  const base = step.state === 'done' || step.state === 'current' ? stamp || (step.state === 'done' ? 'Done' : null) : UNSTAMPED[step.state];
  return [step.sub, base].filter(Boolean).join(' · ');
}

export function RepairStepRail({ steps, closed }: { steps: RepairRecordModel['steps']; closed: boolean }) {
  const rail: RailStep[] = steps.map((step) => ({
    id: step.key,
    icon: step.key === 'ready' && step.label !== 'Ready for pickup' ? <Truck aria-hidden /> : STEP_ICON[step.key],
    state: step.state === 'skipped' ? 'pending' : step.state,
    tone: step.tone,
    title: step.label,
    meta: stepMeta(step),
    testId: `repair-step-${step.key}`,
  }));
  // Pinned to the newest step started — the rail's latest edge.
  const latest = closed ? rail.at(-1) : (rail.find((step) => step.state === 'current') ?? rail.findLast((step) => step.state === 'done'));
  return (
    <div className="min-w-0 px-4 py-3" data-testid="repair-record-internal">
      <LatestEdgeScroller latestKey={latest?.id ?? null} testId="repair-record-internal-scroll">
        <StepRail steps={rail} size="lg" label="Repair steps" orientation="horizontal" horizontalScroll />
      </LatestEdgeScroller>
    </div>
  );
}

export function RepairCarrierRail({ repairId }: { repairId: number }) {
  const carrier = useQuery(repairCarrierEventsQuery(repairId));
  return (
    <CarrierEventsRail
      events={carrier.data?.events ?? []}
      carrier={carrier.data?.carrier ?? null}
      loading={carrier.isLoading}
      error={carrier.isError}
      testId="repair-record-carrier-events"
    />
  );
}

export function RepairRecordAlerts({ model }: { model: RepairRecordModel }) {
  const alerts: string[] = [];
  if (model.status.stored === 'Cancelled') alerts.push('Cancelled — hidden from every queue');
  if (model.sla.tone === 'late') alerts.push(`Overdue — ${model.sla.face}`);
  if (model.status.stored === 'Awaiting Payment' || model.status.stored === 'Awaiting Additional Parts Payment') {
    alerts.push(model.device.price ? `Payment due · ${model.device.price}` : 'Payment due · no price set');
  }
  if (!model.closed && model.steps.find((step) => step.key === 'labeled')?.state !== 'done') alerts.push('2×1 label not printed');
  if (alerts.length === 0) return null;
  return (
    <div className={DESK_RECORD_COLUMN_CARD_CLASS} data-testid="repair-record-alerts">
      {alerts.map((alert) => (
        <EvidenceNotice key={alert} tone="warn">
          {alert}
        </EvidenceNotice>
      ))}
    </div>
  );
}

export function RepairStatusHistory({ rows }: { rows: RepairRecordModel['history'] }) {
  if (rows.length === 0) return <p className="px-4 pb-3 text-role-data text-mode-muted">No status changes recorded.</p>;
  return (
    <ol className="flex flex-col px-4 pb-2" data-testid="repair-record-history">
      {rows.map((row, index) => (
        <li key={`${row.at}:${index}`} className="flex items-baseline gap-3 border-b border-mode-fact py-2 last:border-b-0">
          <span className="min-w-0 flex-1 text-role-data text-mode-ink">
            {row.from ? <span className="text-mode-muted">{repairStatusOperatorLabel(row.from)} → </span> : null}
            <span className="font-semibold">{repairStatusOperatorLabel(row.to)}</span>
            {row.who ? <span className="text-mode-muted"> · {row.who}</span> : null}
          </span>
          <time className={cn(RECORD_ID_CLASS, 'shrink-0 text-mode-muted')}>{formatMonthDayTimePST(row.at)}</time>
        </li>
      ))}
    </ol>
  );
}

/** The support tickets linked to the repair (Link ticket / Create ticket write them); silent when none. */
export function LinkedSupportTickets({ repairId }: { repairId: number }) {
  const linked = useRepairLinkedTickets(repairId);
  const rows = (linked.data ?? []).filter((row) => row.ticketId != null);
  if (rows.length === 0) return null;
  return (
    <EvidenceFactRow label="Support">
      <span className="flex min-w-0 flex-wrap items-center gap-x-3" data-testid="repair-record-support-tickets">
        {rows.map((row) => (
          <span key={row.supportTicketId} title={row.subject ?? undefined}>
            <TicketLink ticket={String(row.ticketId)} />
          </span>
        ))}
      </span>
    </EvidenceFactRow>
  );
}

/** Add or correct the device's serial — the repair's link writer (`POST /api/repair-service/:id/link`, only `serial_number`). */
export function SerialEditor({ repairId, serial, onSaved }: { repairId: number; serial: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(serial ?? '');
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return (
      <Button type="button" variant="secondary" size="sm" icon={serial ? <Pencil /> : <Plus />} onClick={() => setEditing(true)} data-testid="repair-record-serial-edit">
        {serial ? 'Edit serial' : 'Add serial'}
      </Button>
    );
  }
  const save = async () => {
    const next = value.trim();
    if (next === (serial ?? '') || saving) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/repair-service/${repairId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: next || null }),
      });
      if (!res.ok) throw new Error(`Serial save failed (${res.status})`);
      toast.success(next ? `Serial ${next} saved` : 'Serial cleared');
      setEditing(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Serial save failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      data-testid="repair-record-serial-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TextField label="Serial number" value={value} onChange={setValue} mono autoFocus className="min-w-0 flex-1" />
      <Button type="submit" size="sm" variant="ink" loading={saving} data-testid="repair-record-serial-save">
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}

/** An in-record link: ruled underline, darkens on hover. */
const LINK_CLASS = cn('underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'));

function Facts({ children }: { children: ReactNode }) {
  return <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">{children}</div>;
}

/** The aside's evidence: the customer (tel: / mailto:), then the ticket — Zendesk #, channel, full tracking, carton, support tickets. */
export function RepairRecordFlow({ model }: { model: RepairRecordModel }) {
  const { customer } = model;
  return (
      <RecordFlowFacts
        direction="inbound"
        testId="repair-record-flow"
        party={
          <RecordFlowSection title="Customer" testId="repair-record-customer">
            <Facts>
              <EvidenceFactRow label="Name">
                <span className={cn('block truncate font-semibold', !customer.name && 'text-mode-warn')} title={customer.name ?? undefined}>
                  {customer.name ?? 'Not provided'}
                </span>
              </EvidenceFactRow>
              {customer.phone ? (
                <EvidenceFactRow label="Phone">
                  <a href={`tel:${customer.phone}`} className={cn(RECORD_ID_CLASS, LINK_CLASS)} data-testid="repair-record-phone">
                    {formatPhoneNumber(customer.phone)}
                  </a>
                </EvidenceFactRow>
              ) : null}
              {customer.email ? (
                <EvidenceFactRow label="Email">
                  <a href={`mailto:${customer.email}`} title={customer.email} className={cn('block truncate lowercase', LINK_CLASS)} data-testid="repair-record-email">
                    {customer.email}
                  </a>
                </EvidenceFactRow>
              ) : null}
            </Facts>
          </RecordFlowSection>
        }
        movement={
          <RecordFlowSection title="Ticket" testId="repair-record-ticket">
            <Facts>
              <EvidenceFactRow label="Ticket #">
                {model.title.ticket ? <TicketLink ticket={model.title.ticket} /> : <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>None</span>}
              </EvidenceFactRow>
              {model.channel ? (
                <EvidenceFactRow label="Channel">
                  <span className={RECORD_ID_CLASS}>{REPAIR_CHANNEL_LABEL[model.channel]}</span>
                </EvidenceFactRow>
              ) : null}
              {model.tracking ? (
                <EvidenceFactRow label="Tracking">
                  <CopyableCellValue
                    value={model.tracking}
                    historyKind="Tracking number"
                    className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}
                  />
                </EvidenceFactRow>
              ) : null}
              {model.carton ? (
                <EvidenceFactRow label="Carton">
                  <Link href={cartonReadHref(model.carton.receivingId)} className={cn(RECORD_ID_CLASS, LINK_CLASS)} data-testid="repair-record-carton">
                    {model.carton.face}
                  </Link>
                </EvidenceFactRow>
              ) : null}
              <LinkedSupportTickets repairId={model.id} />
            </Facts>
          </RecordFlowSection>
        }
      />
  );
}
