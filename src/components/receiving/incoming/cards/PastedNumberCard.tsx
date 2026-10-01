'use client';

/**
 * One PASTED NUMBER on the Inbound triage list (`?ref_in=`) — the receiving
 * family's adapter over the shared {@link RecordCard}. The card is the number:
 * its identity is the operator's string, its corner the Check's status and
 * reason. A number lines carry wears those lines (their carrier state stays
 * in the facts row); a number nothing carries is a placeholder card built
 * from its {@link ReconEntry}.
 */

import { memo, useMemo } from 'react';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import type { RecordFactColumn } from '@/design-system/components/record-card/record-fact';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardModelBase, TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { RecordStateFace } from '@/design-system/tokens/record';
import type { StateName } from '@/design-system/tokens/lifecycle';
import type { RowGroup } from '@/lib/group-rows';
import type { PastedNumber } from '@/lib/receiving/pasted-numbers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { RECON_STATUS_LABELS, type ReconEntry } from '@/lib/receiving/reconcile';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { incomingDeliveryRecordState } from '../incoming-delivery-state';
import { ReceiptCardPeek } from './IncomingDeliveryCard';
import { receiptCardModel, receiptRecordCard, type ReceiptCardModel } from './receipt-card-model';

/** A record on the numbers face: a line the number holds, or the number alone (`line` null, negative id). */
export interface PastedNumberRow {
  id: number;
  number: PastedNumber;
  line: ReceivingLineRow | null;
}

export interface PastedNumberCardModel extends TriageCardModelBase<PastedNumberRow> {
  number: PastedNumber;
  /** The lines as a purchase card; null for a number nothing carries. */
  receipt: ReceiptCardModel | null;
}

/** The pipeline's facts plus the carrier state — the corner now speaks for the number. */
export const PASTED_NUMBER_FACTS: readonly RecordFactColumn[] = [
  ...INCOMING_PIPELINE_VIEW.facts.slice(0, 2),
  { id: 'carrier', tier: 'always' },
  ...INCOMING_PIPELINE_VIEW.facts.slice(2),
];

export const pastedNumberGroupKey = (group: RowGroup<PastedNumberRow>): string => group.key;

export function pastedNumberCardModel(group: RowGroup<PastedNumberRow>): PastedNumberCardModel {
  const first = group.rows[0]!;
  if (!first.line) return { key: group.key, ids: [first.id], lead: first, number: first.number, receipt: null };
  const receipt = receiptCardModel({ key: group.key, rows: group.rows.map((row) => row.line!) });
  const lead = group.rows.find((row) => row.id === receipt.lead.id) ?? first;
  return { key: group.key, ids: receipt.ids, lead, number: first.number, receipt };
}

/** The number's standing in words — the card corner, the record's subtitle. */
export function pastedNumberStatusFace(entry: ReconEntry): { face: string; tone: StateName } {
  if (entry.pending) return { face: entry.detail, tone: 'neutral' };
  return {
    face: `${RECON_STATUS_LABELS[entry.status]} · ${entry.detail}`,
    tone: entry.status === 'received' ? 'success' : 'warning',
  };
}

function placeholderState(entry: ReconEntry): RecordStateFace {
  if (entry.pending) return { id: 'PASTED_PENDING', code: 'CHK', label: entry.detail, tone: 'neutral', icon: 'clock' };
  if (entry.status === 'received') {
    return { id: 'PASTED_RECEIVED', code: 'RCV', label: RECON_STATUS_LABELS.received, tone: 'success', icon: 'package-check' };
  }
  return {
    id: 'PASTED_NOT_RECEIVED',
    code: 'NR',
    label: RECON_STATUS_LABELS.not_received,
    tone: entry.exception ? 'danger' : 'warning',
    icon: 'package-x',
  };
}

export const PASTED_NUMBER_NOTHING_ON_FILE = 'Nothing on file carries this number';

/** The number as the shared card reads it. */
export function pastedNumberRecordCard(model: PastedNumberCardModel): RecordCardModel {
  const { entry, sharedWith } = model.number;
  const status = pastedNumberStatusFace(entry);
  // The badge says the number needs a person; the corner already says why.
  const chips = entry.exception
    ? [
        {
          id: 'exception',
          tone: 'warning' as const,
          short: entry.exception.reason === entry.detail ? 'Needs a person' : entry.exception.reason,
          tooltip: entry.exception.reason,
          testId: 'pasted-number-badge',
        },
      ]
    : [];
  const corner = { kind: 'none' as const };
  if (model.receipt) {
    const base = receiptRecordCard(model.receipt);
    const carrier = new Map(model.receipt.rows.map((row) => [row.id, incomingDeliveryRecordState(row).label]));
    return {
      ...base,
      key: model.key,
      chips,
      status: corner,
      aria: {
        card: `${entry.ref}, ${status.face}, ${base.aria.card}`,
        open: `Open ${entry.ref}`,
        check: `Select ${entry.ref}`,
      },
      lines: base.lines.map((line) => ({
        ...line,
        facts: { ...line.facts, carrier: { kind: 'text', text: carrier.get(line.id) ?? '' } },
      })),
    };
  }
  const state = placeholderState(entry);
  const title = sharedWith ? `Its lines sit under ${sharedWith}` : PASTED_NUMBER_NOTHING_ON_FILE;
  return {
    key: model.key,
    leadId: model.lead.id,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: status.face,
    alert: null,
    aria: { card: `${entry.ref}, ${status.face}, ${title}`, open: `Open ${entry.ref}`, check: `Select ${entry.ref}` },
    channel: null,
    person: entry.vendor,
    chips,
    notes: { fixed: null, own: null },
    status: corner,
    next: null,
    lines: [
      {
        id: model.lead.id,
        title,
        photoUrl: null,
        alert: false,
        alertNote: null,
        facts: {
          tracking: entry.poNumber ? { kind: 'code', text: `PO ${entry.poNumber}`, title: 'Purchase order' } : null,
        },
      },
    ],
    hiddenAlertLabel: () => '',
  };
}

/** Quick look for a number nothing carries: what the Check said. */
function PlaceholderPeek({ entry }: { entry: ReconEntry }) {
  const facts: [string, string | null][] = [
    ['Check', entry.detail],
    ['Purchase order', entry.poNumber],
    ['Vendor', entry.vendor],
    ['Badge', entry.exception?.reason ?? null],
  ];
  return (
    <CollapseItem>
      <dl data-testid="pasted-number-card-peek" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-[13px]">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="min-w-0 truncate font-medium text-text-default">{value}</dd>
            </div>
          ))}
      </dl>
    </CollapseItem>
  );
}

export const PastedNumberCard = memo(function PastedNumberCard({
  model,
  checked,
  open,
  openId,
  expanded,
  peekOpen,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  onTogglePeek,
}: TriageCardSlotProps<PastedNumberRow, PastedNumberCardModel>) {
  const record = useMemo(() => pastedNumberRecordCard(model), [model]);
  const { entry } = model.number;
  // The PO beside the number, unless the number IS the PO.
  const identity = model.receipt?.identity ?? null;
  const po = identity && identity.replace(/[^a-z0-9]/gi, '').toUpperCase() !== entry.key ? identity : null;
  return (
    <RecordCard
      model={record}
      factColumns={PASTED_NUMBER_FACTS}
      testIdPrefix={INCOMING_PIPELINE_VIEW.testIdPrefix}
      rowAttrs={{ 'data-pasted-number': entry.ref, 'data-placeholder': model.receipt ? 0 : 1 }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={(event) => onOpen(model.lead, event)}
      onToggleCheck={(event) => onToggleCheck(model, event)}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono" title={entry.ref} data-testid="pasted-number-ref">
              {entry.ref}
            </span>
            {po ? <span className="truncate text-[13px] font-normal text-text-muted">PO {po}</span> : null}
          </span>
        ),
      }}
      trailing={null}
      quickLook={
        model.receipt ? <ReceiptCardPeek key="peek" model={model.receipt} /> : <PlaceholderPeek key="peek" entry={entry} />
      }
      onOpenLine={
        model.receipt
          ? (lineId, event) => {
              const row = model.receipt!.rows.find((candidate) => candidate.id === lineId);
              if (row) onOpen({ id: row.id, number: model.number, line: row }, event);
            }
          : undefined
      }
      openLineId={open ? openId : null}
    />
  );
});
