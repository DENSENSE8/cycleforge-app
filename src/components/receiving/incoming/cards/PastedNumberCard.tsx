'use client';

/**
 * One PASTED NUMBER on the Inbound triage list (`?ref_in=`) — the receiving
 * family's adapter over the shared {@link RecordCard}. The card is the number:
 * its identity is the operator's string, its rail and corner the verdict in
 * physical words (Unboxed · 0 of 3 received, Delivered · not scanned). Each
 * line reads the sheet row it replaces: units counted / bought, tracking, the
 * carrier's last word (ETA, delivered, who signed), purchase date + age, price.
 * A follow-up (Need claim, Double check, …) is the next step; its note is the
 * card's own note, edited on line 1. A number nothing carries is a placeholder
 * card built from its {@link ReconEntry}.
 */

import { createContext, memo, useContext, useMemo } from 'react';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { CollapseItem } from '@/design-system/components/Collapse';
import type { RecordCardNextStep } from '@/design-system/components/record-card/record-card-types';
import { RecordFactPaint, type RecordFactColumn } from '@/design-system/components/record-card/record-fact';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardModelBase, TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import type { ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { RowGroup } from '@/lib/group-rows';
import { INBOUND_FOLLOWUP_LABELS, type InboundFollowup } from '@/lib/receiving/inbound-followups';
import {
  pastedNumberFacts,
  pastedNumberNextStep,
  pastedNumberStateFace,
  type PastedNumberFacts,
} from '@/lib/receiving/pasted-number-facts';
import type { PastedNumber } from '@/lib/receiving/pasted-numbers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { RECON_STATUS_LABELS, type ReconEntry } from '@/lib/receiving/reconcile';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { ReceiptCardPeek } from './IncomingDeliveryCard';
import { carrierFace, FOLLOWUP_TONE, followupTip, orderedFace, totalFace } from './pasted-number-faces';
import { receiptCardModel, receiptRecordCard, type ReceiptCardModel } from './receipt-card-model';
import { purchaseIdentity } from '../incoming-delivery-state';

/** A record on the numbers face: a line the number holds, or the number alone (`line` null, negative id). */
export interface PastedNumberRow {
  id: number;
  number: PastedNumber;
  line: ReceivingLineRow | null;
  /** The number's follow-up (one per number — every row of it carries the same). */
  followup: InboundFollowup | null;
}

export interface PastedNumberCardModel extends TriageCardModelBase<PastedNumberRow> {
  number: PastedNumber;
  /** The lines as a purchase card; null for a number nothing carries. */
  receipt: ReceiptCardModel | null;
  /** The sheet row: units, purchase age, total, carrier word. */
  facts: PastedNumberFacts;
  followup: InboundFollowup | null;
}

/** Per line, left → right: units counted / bought · tracking · carrier's word · purchased · price · SKU. */
export const PASTED_NUMBER_FACTS: readonly RecordFactColumn[] = [
  { id: 'qty', tier: 'always' },
  { id: 'tracking', tier: 'always' },
  { id: 'carrier', tier: 'always' },
  { id: 'ordered', tier: 'always' },
  { id: 'price', tier: 'label' },
  { id: 'sku', tier: 'label' },
];

export const pastedNumberGroupKey = (group: RowGroup<PastedNumberRow>): string => group.key;

export function pastedNumberCardModel(group: RowGroup<PastedNumberRow>): PastedNumberCardModel {
  const first = group.rows[0]!;
  const facts = pastedNumberFacts(first.number.lines, first.number.entry, new Date());
  const base = { number: first.number, facts, followup: first.followup };
  if (!first.line) return { key: group.key, ids: [first.id], lead: first, receipt: null, ...base };
  const receipt = receiptCardModel({ key: group.key, rows: group.rows.map((row) => row.line!) });
  const lead = group.rows.find((row) => row.id === receipt.lead.id) ?? first;
  return { key: group.key, ids: receipt.ids, lead, receipt, ...base };
}

/** The number's standing in words — the record's subtitle, the card's hover. */
export function pastedNumberStatusFace(entry: ReconEntry): { face: string; tone: StateName } {
  if (entry.pending) return { face: entry.detail, tone: 'neutral' };
  return {
    face: `${RECON_STATUS_LABELS[entry.status]} · ${entry.detail}`,
    tone: entry.status === 'received' ? 'success' : 'warning',
  };
}

/** A follow-up outranks the computed step: the person who tagged it said what happens next. */
export function pastedNumberNext(model: Pick<PastedNumberCardModel, 'number' | 'facts' | 'followup'>): RecordCardNextStep | null {
  if (model.followup) {
    return {
      label: INBOUND_FOLLOWUP_LABELS[model.followup.tag],
      tone: FOLLOWUP_TONE[model.followup.tag],
      tip: followupTip(model.followup),
      blocked: model.followup.tag === 'need_claim',
    };
  }
  const next = pastedNumberNextStep(model.number.entry, model.facts);
  return next ? { ...next, tip: `Next: ${next.label.toLowerCase()}` } : null;
}

export const PASTED_NUMBER_NOTHING_ON_FILE = 'Nothing on file carries this number';

/** The number as the shared card reads it. */
export function pastedNumberRecordCard(model: PastedNumberCardModel): ViewCardModel<typeof INCOMING_PIPELINE_VIEW> {
  const { entry, sharedWith } = model.number;
  const status = pastedNumberStatusFace(entry);
  const state = pastedNumberStateFace(entry, model.receipt ? model.facts : null);
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
  const corner = { kind: 'state' as const, face: state.label, tone: state.tone, tip: status.face };
  const next = pastedNumberNext(model);
  const own = model.followup?.note ?? null;
  if (model.receipt) {
    const base = receiptRecordCard(model.receipt);
    const byId = new Map(model.receipt.rows.map((row) => [row.id, row]));
    return {
      ...base,
      key: model.key,
      state,
      stateIcon: recordStateGlyph(state),
      stateMeaning: entry.exception ? `${state.label} — ${entry.exception.reason}` : state.label,
      chips,
      notes: { ...base.notes, own },
      status: corner,
      next,
      aria: {
        card: `${entry.ref}, ${state.label}, ${base.aria.card}`,
        open: `Open ${entry.ref}`,
        check: `Select ${entry.ref}`,
      },
      lines: base.lines.map((line) => {
        const row = byId.get(line.id);
        if (!row) return line;
        const one = pastedNumberFacts([row], entry, new Date());
        return {
          ...line,
          facts: {
            ...line.facts,
            qty: { kind: 'received', received: one.units.received, expected: one.units.expected },
            // The tracking column already says "No tracking".
            carrier: one.carrier.kind === 'no_tracking' ? null : carrierFace(one.carrier),
            ordered: orderedFace(one.ordered),
            price: totalFace(one.total),
          },
        };
      }),
    };
  }
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
    notes: { fixed: null, own },
    status: corner,
    next,
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

/** What the ledger lets a card do in place — today, save the number's follow-up note. */
export interface PastedNumberActions {
  saveNote: (model: PastedNumberCardModel, text: string) => void;
}

export const PastedNumberActionsContext = createContext<PastedNumberActions | null>(null);

/** Quick look for a number nothing carries: what the Check said. */
export function PlaceholderPeek({ entry }: { entry: ReconEntry }) {
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
  const actions = useContext(PastedNumberActionsContext);
  const { entry } = model.number;
  // The PO beside the number, unless the number IS the PO.
  const identity = model.receipt ? purchaseIdentity(model.receipt.lead) : null;
  const po = identity && identity.replace(/[^a-z0-9]/gi, '').toUpperCase() !== entry.key ? identity : null;
  return (
    <RecordCard
      view={INCOMING_PIPELINE_VIEW}
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
      // The sheet's order total — a one-line number already shows it on its line.
      trailing={
        model.facts.item.lines > 1 && model.facts.total
          ? {
              role: 'trailing',
              content: (
                <span className="text-role-caption tabular-nums" data-testid="pasted-number-total" title="Order total — Σ price × qty bought">
                  <RecordFactPaint face={totalFace(model.facts.total)} />
                </span>
              ),
            }
          : null
      }
      onSaveNote={actions ? (text) => actions.saveNote(model, text) : undefined}
      quickLook={
        model.receipt ? <ReceiptCardPeek key="peek" model={model.receipt} /> : <PlaceholderPeek key="peek" entry={entry} />
      }
      onOpenLine={
        model.receipt
          ? (lineId, event) => {
              const row = model.receipt!.rows.find((candidate) => candidate.id === lineId);
              if (row) onOpen({ id: row.id, number: model.number, line: row, followup: model.followup }, event);
            }
          : undefined
      }
      openLineId={open ? openId : null}
    />
  );
});
