import { resolveInboundDeliveryRecordState } from '@/design-system/tokens/inbound-delivery';
import { RECEIVING_LIFECYCLE } from '@/design-system/tokens/receiving-lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { isClaimCode, isInvestigationCode, receivingExceptionLabel } from './exception-codes';
import type { DockedKind } from './inbound-lane';
import { effectiveIntakeKind } from './kinds/registry';
import type { ReceivingLineRow } from './receiving-line-row';
import { deriveReceivingLineStatus } from './workflow-stages';

/**
 * An arrival scan proves only that the sealed package reached the input area.
 * Contents, quantity discrepancies and quality remain unknown until Unbox.
 */
export const DOCKED_PACKAGE_FACE: RecordStateFace = {
  id: 'DOCKED',
  code: 'DCK',
  label: 'Docked',
  tone: 'info',
  icon: 'package',
};

export function dockedPackageRecordFace(_row: ReceivingLineRow): RecordStateFace {
  return DOCKED_PACKAGE_FACE;
}

/**
 * Unboxed "needs attention" pills (owner 2026-09-28), in pill order — the
 * `?dflag=` vocabulary, most urgent first (Unfound › Claim › Short). Each is a
 * carton fact read off its lines; a carton wears a pill when any of its lines
 * does. Never a lifecycle state.
 */
export const DOCKED_FLAG_OPTIONS = [
  { value: 'UNFOUND', label: 'Unfound' },
  { value: 'CLAIM', label: 'Claim' },
  { value: 'SHORT', label: 'Short' },
] as const;
export type DockedFlag = (typeof DOCKED_FLAG_OPTIONS)[number]['value'];

/**
 * The Unboxed status pills (owner 2026-09-28): the attention pills, then
 * **Unboxed** — the normal case, a carton with nothing left to fix (every line
 * reads green Unboxed). The `?dflag=` vocabulary, in pill order.
 */
export const DOCKED_STATUS_OPTIONS = [...DOCKED_FLAG_OPTIONS, { value: 'UNBOXED', label: 'Unboxed' }] as const;
export type DockedStatus = (typeof DOCKED_STATUS_OPTIONS)[number]['value'];

/**
 * A carton's pills, in pill order: every attention flag any of its lines wears,
 * else Unboxed when every line reads clean (an Exception line is neither).
 */
export function dockedCartonStatuses(rows: readonly ReceivingLineRow[]): DockedStatus[] {
  const flags = new Set(rows.flatMap(dockedFlags));
  if (flags.size > 0) return DOCKED_FLAG_OPTIONS.map((o) => o.value).filter((flag) => flags.has(flag));
  const clean = rows.length > 0 && rows.every((row) => dockedRecordFace(row).id === RECEIVING_LIFECYCLE.RECEIVED.id);
  return clean ? ['UNBOXED'] : [];
}

/**
 * A line's pills. Claim: an OPEN claim-family exception recorded by a filed
 * ticket (owner 2026-09-28 — a ticket says investigation or claim; an
 * investigation ticket, or one with no reason, is not a claim). Short: fewer
 * received than expected. Unfound: the carton matched no PO (an unfound
 * placeholder, or an unmatched carton's line not yet paired to a PO) — an
 * identity fact, ticket or not.
 */
export function dockedFlags(row: ReceivingLineRow): DockedFlag[] {
  const flags: DockedFlag[] = [];
  // Most urgent first (pill order): the face reads flags[0].
  if (row.id <= 0 || (row.receiving_source === 'unmatched' && !row.zoho_purchaseorder_id)) flags.push('UNFOUND');
  if ((row.ticket_reasons ?? []).some((r) => isClaimCode(r.code) && (r.ticket ?? '').trim())) flags.push('CLAIM');
  if (row.id > 0 && row.quantity_expected != null && dockedReceivedQuantity(row) < row.quantity_expected) flags.push('SHORT');
  return flags;
}

/** A filed ticket as line 1 names it: what it is for, then its number. */
export interface DockedTicketLabel {
  ticket: string;
  /** "Investigating", the claim code's label ("Damaged"), or "Ticket" when it carries no reason. */
  label: string;
  family: 'investigation' | 'claim' | null;
}

/**
 * The line's filed tickets, each with its reason: investigations first, then
 * claims, then a reasonless ticket. One entry per ticket number.
 */
export function dockedTicketLabels(row: ReceivingLineRow): DockedTicketLabel[] {
  const out: DockedTicketLabel[] = [];
  const seen = new Set<string>();
  const reasons = row.ticket_reasons ?? [];
  for (const family of ['investigation', 'claim'] as const) {
    for (const reason of reasons) {
      const ticket = (reason.ticket ?? '').trim();
      if (!ticket || seen.has(ticket)) continue;
      if (family === 'investigation' ? !isInvestigationCode(reason.code) : !isClaimCode(reason.code)) continue;
      seen.add(ticket);
      out.push({
        ticket,
        label: family === 'investigation' ? 'Investigating' : receivingExceptionLabel(reason.code),
        family,
      });
    }
  }
  const filed = (row.claim_ticket ?? '').trim();
  if (filed && !seen.has(filed)) out.push({ ticket: filed, label: 'Ticket', family: null });
  return out;
}

/** The sidebar Kind row's options, in `DOCKED_KIND_VALUES` order. */
export const DOCKED_KIND_OPTIONS: readonly { value: DockedKind; label: string }[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'return', label: 'Return' },
  { value: 'trade_in', label: 'Trade-in' },
  { value: 'repair', label: 'Repair' },
];

/**
 * What kind of intake a line is. Repair is a carton intake value outside the
 * intake-kind registry (repair service drop-offs); the rest resolve through
 * {@link effectiveIntakeKind}. A local pickup never reaches Unboxed, so it
 * reads as a purchase here.
 */
export function dockedIntakeKind(row: ReceivingLineRow): DockedKind {
  const line = (row.intake_type || row.receiving_type || '').trim().toUpperCase();
  const carton = (row.carton_intake_type || '').trim().toUpperCase();
  if (line === 'REPAIR' || carton === 'REPAIR') return 'repair';
  switch (effectiveIntakeKind(line, carton)) {
    case 'RETURN': return 'return';
    case 'TRADE_IN': return 'trade_in';
    default: return 'purchase';
  }
}

const EXCEPTION_WORKFLOWS = new Set(['FAILED', 'RTV', 'SCRAP']);

/**
 * Read the receiving lifecycle, never infer a warehouse scan from list
 * membership. History is receiving only (owner 2026-09-28): Scanned →
 * Received, plus Exception. Unboxed IS received — once the carton is open in
 * the building its contents are received, found or unfound, and the
 * received-vs-expected fact says whether the count agrees. Quality control is
 * what comes next ({@link dockedNextStep}), never a History state or filter.
 */
export function dockedReceivingState(row: ReceivingLineRow): RecordStateFace {
  // Negative ids are unfound-carton placeholders: their workflow can say DONE
  // without an unbox, so only the carton's own stamps count.
  if (row.id <= 0) {
    if (row.unboxed_at || row.unbox_opened_at) return RECEIVING_LIFECYCLE.RECEIVED;
    if (row.received_at || row.scanned_at) return RECEIVING_LIFECYCLE.SCANNED;
    return resolveInboundDeliveryRecordState(row.delivery_state);
  }
  const workflow = String(row.workflow_status || '').trim().toUpperCase();
  if (EXCEPTION_WORKFLOWS.has(workflow)) return RECEIVING_LIFECYCLE.EXCEPTION;
  const phase = deriveReceivingLineStatus(workflow);
  if (row.received_done_at || row.unboxed_at || phase === 'UNBOXED' || phase === 'RECEIVED') return RECEIVING_LIFECYCLE.RECEIVED;
  if (phase === 'SCANNED' || row.received_at || row.scanned_at) return RECEIVING_LIFECYCLE.SCANNED;
  return resolveInboundDeliveryRecordState(row.delivery_state);
}

export function dockedReceivedQuantity(row: ReceivingLineRow): number {
  return Number(row.quantity_received ?? 0);
}

/**
 * The card's state face on Unboxed (owner 2026-09-28: not every card reads
 * "Unboxed"): a line wears its most urgent attention — Exception › Unfound ›
 * Claim › Short — and only a clean line reads green Unboxed. Same pill
 * vocabulary, so the rail colour and the pills say the same thing. Unfound is
 * red: stock nobody can sell or pay for until it is identified.
 */
const ATTENTION_FACES: Readonly<Record<DockedFlag, RecordStateFace>> = {
  UNFOUND: { id: 'UNFOUND', code: 'UNF', label: 'Unfound', tone: 'danger', icon: 'unlink' },
  CLAIM: { id: 'CLAIM', code: 'CLM', label: 'Claim', tone: 'warning', icon: 'ticket' },
  SHORT: { id: 'SHORT', code: 'SHT', label: 'Short', tone: 'warning', icon: 'package-x' },
};

export function dockedRecordFace(row: ReceivingLineRow): RecordStateFace {
  const state = dockedReceivingState(row);
  if (state.id === RECEIVING_LIFECYCLE.EXCEPTION.id) return state;
  const flag = dockedFlags(row)[0];
  return flag ? ATTENTION_FACES[flag] : state;
}

/**
 * The line's NEXT step as a present-tense verb, painted "→ Claim" at a card's
 * bottom-right and the Floor row's end — only verbs the carton strip actually
 * runs today (`carton-record-verbs.tsx`): Resolve (pair an unfound carton),
 * Claim (short or failed, no ticket yet), Print label (a SKU'd line never
 * printed). Null = nothing left on the inbound side (a filed claim waits on
 * the ticket; put-away has no carton verb yet).
 */
export function dockedNextStep(row: ReceivingLineRow): string | null {
  const flags = dockedFlags(row);
  const claimed = flags.includes('CLAIM');
  if (flags.includes('UNFOUND')) return 'Resolve';
  if (!claimed && (flags.includes('SHORT') || dockedReceivingState(row).id === RECEIVING_LIFECYCLE.EXCEPTION.id)) return 'Claim';
  if (row.id > 0 && (row.sku ?? '').trim() && !row.label_printed_at) return 'Print label';
  return null;
}

/** Every verb {@link dockedNextStep} can paint, in workflow order. */
export const DOCKED_NEXT_STEPS = ['Resolve', 'Claim', 'Print label'] as const;
/** The unopened Docked surface has exactly one honest next step. */
export const DOCKED_PACKAGE_NEXT_STEPS = ['Unbox'] as const;
