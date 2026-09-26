/** Claim-deadline escalation — Phase 4 of docs/todo/ebay-delivered-not-unboxed-PLAN.md. */

import type { OrgId } from '@/lib/tenancy/constants';
import type { DeliveredNotUnboxedItem } from './delivered-not-unboxed';
// TYPE-only — `ticket-link` reaches server-only modules; erased at runtime.
import type { TicketLinkAnchorInput } from '@/lib/support/ticket-link';
import { CLAIM_DUE_LEAD_DAYS, daysUntilClaimDeadline } from './claim-window';

/** The lead threshold and the day math are re-exported from the dependency-free `./claim-window`, NOT redefined here: */
export { CLAIM_DUE_LEAD_DAYS, daysUntilClaimDeadline };

/** Ceiling on tickets created per org per run. */
export const CLAIMS_ESCALATION_MAX_PER_RUN = 20;

interface ClaimsEscalationCandidate {
  receivingLineId: number;
  receivingId: number | null;
  claimByDate: string;
  daysRemaining: number;
  trackingNumber: string | null;
  carrier: string | null;
  poNumber: string | null;
  itemName: string | null;
  deliveredAt: string | null;
}


/** Which lane rows are due for escalation. */
export function selectEscalationCandidates(
  items: readonly DeliveredNotUnboxedItem[],
  todayKey: string,
  leadDays: number = CLAIM_DUE_LEAD_DAYS,
): ClaimsEscalationCandidate[] {
  const out: ClaimsEscalationCandidate[] = [];
  for (const item of items) {
    // eBay-only by construction: claim_by_date is NULL for every other source.
    if (!item.claim_by_date) continue;
    const daysRemaining = daysUntilClaimDeadline(item.claim_by_date, todayKey);
    if (daysRemaining > leadDays) continue;
    out.push({
      receivingLineId: item.receiving_line_id,
      receivingId: item.receiving_id,
      claimByDate: item.claim_by_date,
      daysRemaining,
      trackingNumber: item.tracking_number_raw,
      carrier: item.carrier,
      poNumber: item.po_number,
      itemName: item.item_name,
      deliveredAt: item.delivered_at,
    });
  }
  // Most urgent first, so a clamped run escalates the ones closest to expiry.
  out.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return out;
}

/**
 * One ticket per line, ever. The key is line-scoped and carries no date, so a
 * re-run tomorrow (or a redeploy, or a manual trigger) collapses onto the same
 * create instead of filing a second ticket about the same carton.
 */
export function escalationIdempotencyKey(receivingLineId: number): string {
  return `receiving-claim-escalation:${receivingLineId}`;
}

/** Where to hang the ticket, in descending precision: */
export function escalationAnchor(c: ClaimsEscalationCandidate): TicketLinkAnchorInput | null {
  if (c.receivingId != null) {
    return { type: 'receiving', receivingId: c.receivingId, lineId: c.receivingLineId };
  }
  if (c.trackingNumber) return { type: 'tracking', trackingNumber: c.trackingNumber };
  return null;
}

/** Subject line — server-assembled; identifies the carton, not the sentiment. */
export function escalationSubject(c: ClaimsEscalationCandidate): string {
  const id = c.trackingNumber ?? c.poNumber ?? `line ${c.receivingLineId}`;
  return c.daysRemaining < 0
    ? `eBay claim window EXPIRED — delivered, never unboxed (${id})`
    : `eBay claim window closes in ${c.daysRemaining}d — delivered, never unboxed (${id})`;
}

/** First comment — the evidence an operator needs to act without opening the app. */
export function escalationNote(c: ClaimsEscalationCandidate): string {
  const lines = [
    c.daysRemaining < 0
      ? `The eBay item-not-received window for this purchase closed on ${c.claimByDate} (${Math.abs(c.daysRemaining)} day(s) ago).`
      : `The eBay item-not-received window for this purchase closes on ${c.claimByDate} (${c.daysRemaining} day(s) from now).`,
    '',
    'The carrier reported this carton DELIVERED, but it was never unboxed at the dock — so either it is sitting somewhere unopened, or the goods never actually arrived.',
    '',
    `Carrier: ${c.carrier ?? 'unknown'}`,
    `Tracking: ${c.trackingNumber ?? '—'}`,
    `Delivered: ${c.deliveredAt ?? '—'}`,
    `PO / order: ${c.poNumber ?? '—'}`,
    `Item: ${c.itemName ?? '—'}`,
    `Receiving line: ${c.receivingLineId}`,
    '',
    'Next: find and unbox the carton, or write it off with a loss reason (Lost / Empty box / Misdelivered / Stolen) so it leaves this queue with a record.',
  ];
  return lines.join('\n');
}

interface ClaimsEscalationDeps {
  listLane: (orgId: OrgId) => Promise<DeliveredNotUnboxedItem[]>;
  /** Existing ticket for the line, if any — suppresses a duplicate escalation. */
  findExistingTicket: (orgId: OrgId, receivingLineId: number) => Promise<boolean>;
  createTicket: (args: {
    orgId: OrgId;
    subject: string;
    note: string;
    anchor: TicketLinkAnchorInput | null;
    idempotencyKey: string;
  }) => Promise<{ supportTicketId: number; providerTicketId: number }>;
  today: () => string;
}

async function realDeps(): Promise<ClaimsEscalationDeps> {
  const [{ listDeliveredNotUnboxed }, { getPrimarySupportTicketForReceiving }, { createSupportTicket }, dateMod] =
    await Promise.all([
      import('./delivered-not-unboxed'),
      import('@/lib/support/tickets'),
      import('@/lib/support/create-ticket'),
      import('@/utils/date'),
    ]);
  return {
    listLane: (orgId) => listDeliveredNotUnboxed(orgId),
    findExistingTicket: async (orgId, receivingLineId) => {
      const row = await getPrimarySupportTicketForReceiving({ orgId, lineId: receivingLineId });
      return row != null;
    },
    createTicket: async ({ orgId, subject, note, anchor, idempotencyKey }) => {
      const res = await createSupportTicket({ orgId, subject, note, anchor, idempotencyKey });
      return { supportTicketId: res.supportTicketId, providerTicketId: res.providerTicketId };
    },
    today: () => dateMod.getCurrentPSTDateKey(),
  };
}

/**
 * Module-private: the cron route passes an inline literal and never names this
 * type, so exporting it is dead code (knip gate) — the same call the loss
 * write-off's `LossExceptionCode` made. Export it when a consumer needs the name.
 */
interface ClaimsEscalationOptions {
  /** Master switch — REQUIRED, never defaulted ("a safety classification is a REQUIRED parameter"). */
  enabled: boolean;
  /** Force report-only even when armed. */
  dryRun?: boolean;
}

export interface ClaimsEscalationOrgSummary {
  orgId: string;
  laneSize: number;
  candidates: number;
  alreadyTicketed: number;
  created: number;
  clamped: number;
  /** True when the flag is off or dryRun — candidates reported, nothing filed. */
  reportOnly: boolean;
  errors: number;
}

/**
 * Escalate one org's due claims. Never throws for a single failed ticket — a
 * provider hiccup on carton A must not stop carton B, whose deadline is also
 * running out. Per-ticket failures are counted and logged.
 */
export async function runClaimsEscalationForOrg(
  orgId: OrgId,
  opts: ClaimsEscalationOptions,
  deps?: ClaimsEscalationDeps,
): Promise<ClaimsEscalationOrgSummary> {
  const d = deps ?? (await realDeps());
  const reportOnly = opts.dryRun === true || !opts.enabled;

  const lane = await d.listLane(orgId);
  const candidates = selectEscalationCandidates(lane, d.today());

  const summary: ClaimsEscalationOrgSummary = {
    orgId,
    laneSize: lane.length,
    candidates: candidates.length,
    alreadyTicketed: 0,
    created: 0,
    clamped: 0,
    reportOnly,
    errors: 0,
  };

  for (const c of candidates) {
    if (await d.findExistingTicket(orgId, c.receivingLineId)) {
      summary.alreadyTicketed += 1;
      continue;
    }
    if (summary.created >= CLAIMS_ESCALATION_MAX_PER_RUN) {
      summary.clamped += 1;
      continue;
    }
    if (reportOnly) {
      // Counted as "would create" so a dry run is directly comparable to a live one.
      summary.created += 1;
      continue;
    }
    try {
      await d.createTicket({
        orgId,
        subject: escalationSubject(c),
        note: escalationNote(c),
        anchor: escalationAnchor(c),
        idempotencyKey: escalationIdempotencyKey(c.receivingLineId),
      });
      summary.created += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(
        `[claims-escalation] org ${orgId} line ${c.receivingLineId}: ticket create failed`,
        err,
      );
    }
  }

  if (summary.clamped > 0) {
    console.warn(
      `[claims-escalation] org ${orgId}: clamped at ${CLAIMS_ESCALATION_MAX_PER_RUN} — ` +
        `${summary.clamped} due claim(s) NOT escalated this run`,
    );
  }
  return summary;
}
