/**
 * Bench log → helpdesk ticket (operator 2026-09-24:
 * Bench log → helpdesk ticket (operator 2026-09-24: "auto update ticket from
 */
import type { RepairTicketLink } from '@/lib/repair/ticket-link';
import { REPAIR_DONOR_SOURCE_COPY, repairActionLabel, type RepairActionRecord } from '@/lib/repair/repair-actions';

/**
 * Whether a bench-log note is a public reply (emails the customer) or an
 * internal note. Internal until the operator answers otherwise — flipping this
 * one constant is the whole change.
 */
export const REPAIR_LOG_TICKET_NOTE_PUBLIC = false;

/**
 * A `pending` post whose attempt started longer ago than this is treated as
 * dead (the process that claimed it is gone): the retry route may claim it
 * again and the timeline offers Retry.
 */
export const TICKET_POST_STALE_MS = 2 * 60 * 1000;

export type TicketPostStatus = 'pending' | 'posted' | 'failed';

export type TicketPostFacts = Pick<
  RepairActionRecord,
  'created_at' | 'ticket_post_status' | 'ticket_post_ticket_id' | 'ticket_comment_id' | 'ticket_post_error' | 'ticket_post_attempted_at'
>;

export type TicketPostEligibility =
  | { ok: true; ticketId: number }
  | { ok: false; reason: 'not-linked' | 'posted' | 'in-flight' };

/** May this entry be posted now? */
export function ticketPostEligibility(
  link: RepairTicketLink | null,
  post: TicketPostFacts,
  nowMs: number,
): TicketPostEligibility {
  if (post.ticket_post_status === 'posted' || post.ticket_comment_id != null) return { ok: false, reason: 'posted' };
  if (link?.state !== 'linked') return { ok: false, reason: 'not-linked' };
  if (
    post.ticket_post_status === 'pending' &&
    post.ticket_post_attempted_at != null &&
    nowMs - Date.parse(post.ticket_post_attempted_at) < TICKET_POST_STALE_MS
  ) {
    return { ok: false, reason: 'in-flight' };
  }
  return { ok: true, ticketId: link.zendeskTicketId };
}

export type TicketPostView =
  | { kind: 'posted'; ticketId: number | null }
  | { kind: 'posting' }
  | { kind: 'failed'; error: string };

/** What the timeline row says about the ticket post; null when the entry is not posted anywhere. */
export function ticketPostView(post: TicketPostFacts, nowMs: number): TicketPostView | null {
  switch (post.ticket_post_status) {
    case 'posted':
      return { kind: 'posted', ticketId: post.ticket_post_ticket_id };
    case 'failed':
      return { kind: 'failed', error: post.ticket_post_error?.trim() || 'The helpdesk did not accept it.' };
    case 'pending': {
      const since = Date.parse(post.ticket_post_attempted_at ?? post.created_at);
      return Number.isFinite(since) && nowMs - since >= TICKET_POST_STALE_MS
        ? { kind: 'failed', error: 'The post did not finish.' }
        : { kind: 'posting' };
    }
    default:
      return null;
  }
}

/** The note body: what was done, which parts and serials, where the part came from, who logged it. */
export function repairActionTicketNote(action: RepairActionRecord): string {
  const lines: string[] = [];
  const head = `Bench log · RS-${action.repair_id} · ${repairActionLabel(action.action_type)}`;
  lines.push(action.part_name ? `${head} — ${action.part_name}` : head);

  const part = (label: string, sku: string | null, serial: string | null) => {
    const bits = [sku, serial ? `SN ${serial}` : null].filter(Boolean);
    if (bits.length) lines.push(`${label}: ${bits.join(' · ')}`);
  };
  part(action.action_type === 'replaced' ? 'Out' : 'Part', action.old_sku, action.old_serial);
  part(action.action_type === 'awaiting_part' ? 'Needed' : 'In', action.new_sku, action.new_serial);

  if (action.component_ref || action.component_value) {
    const qty = action.component_qty != null && action.component_qty > 1 ? `× ${action.component_qty}` : null;
    lines.push(`Ref: ${[action.component_ref, action.component_value, qty].filter(Boolean).join(' ')}`);
  }
  if (action.donor_source) {
    const source = REPAIR_DONOR_SOURCE_COPY[action.donor_source]?.label ?? action.donor_source;
    const detail = action.donor_ref ?? (action.stock_bin_label ? `bin ${action.stock_bin_label}` : null);
    lines.push(`From: ${detail ? `${source} (${detail})` : source}`);
  }
  if (action.notes) lines.push('', action.notes);
  if (action.staff_name) lines.push('', `— ${action.staff_name}`);
  return lines.join('\n');
}
