/**
 * Support events on the task Timeline — pure and client-safe. The Support loop
 * writes one `audit_logs` row per event on the item's primary task (entity
 * `work_assignment`); `readTaskTimelineAudit` reads these actions and
 * `taskTimelineItems` paints each with {@link supportTimelineFace}. Messages
 * themselves land as `work_assignment_follow_ups` rows (channel `message`).
 */
import { formatMonthDayTimePST } from '@/utils/date';

export const SUPPORT_TIMELINE_ACTIONS = [
  'support.item.purpose',
  'support.item.next_step',
  'support.item.lifecycle',
  'support.item.reopen',
  'support.item.resolve',
  'support.item.resolve_override',
  'support.message.no_reply',
  'support.reply',
  'support.reply.mark_sent',
] as const;
export type SupportTimelineAction = (typeof SUPPORT_TIMELINE_ACTIONS)[number];

export function isSupportTimelineAction(action: string): action is SupportTimelineAction {
  return (SUPPORT_TIMELINE_ACTIONS as readonly string[]).includes(action);
}

/** What one support event row says; `null` = on the record but not painted (the status row already says it). */
export interface SupportTimelineFace {
  title: string;
  detail: string | null;
}

function str(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function when(raw: unknown): string | null {
  const iso = str(raw);
  return iso && Number.isFinite(Date.parse(iso)) ? formatMonthDayTimePST(iso) : null;
}

const BLOCKER_WORDS: Readonly<Record<string, string>> = {
  purpose_unacknowledged: 'purpose not set',
  unanswered_inbound: 'unanswered customer message',
  follow_up_overdue: 'follow-up overdue',
  send_pending: 'reply not confirmed sent',
  send_failed: 'reply failed',
};

/** One stored event (`after_data`) → its Timeline words. */
export function supportTimelineFace(action: string, after: Record<string, unknown> | null): SupportTimelineFace | null {
  const a = after ?? {};
  switch (action) {
    case 'support.item.purpose':
      return {
        title: a.purpose === 'internal_record' ? 'Marked internal record' : 'Marked customer conversation',
        detail: typeof a.staledDrafts === 'number' && a.staledDrafts > 0 ? 'AI drafts set aside' : null,
      };
    case 'support.item.next_step': {
      const next = when(a.nextFollowUpAt);
      if (a.nextStep === 'waiting_customer') return { title: 'Waiting on customer', detail: next ? `Follow up ${next}` : null };
      if (a.nextStep === 'follow_up_later') return { title: next ? `Follow up ${next}` : 'Follow up later', detail: null };
      return null;
    }
    case 'support.item.lifecycle':
      if (a.lifecycle === 'snoozed') {
        const until = when(a.snoozedUntil);
        return { title: until ? `Snoozed until ${until}` : 'Snoozed', detail: null };
      }
      return { title: 'Reopened', detail: null };
    case 'support.item.reopen':
      return { title: 'Customer wrote again — reopened', detail: null };
    case 'support.item.resolve': {
      const reason = str(a.reason);
      return reason ? { title: 'Resolved', detail: reason } : null;
    }
    case 'support.item.resolve_override': {
      const blockers = Array.isArray(a.blockers)
        ? a.blockers.map((b) => (typeof b === 'string' ? BLOCKER_WORDS[b] ?? b : null)).filter(Boolean)
        : [];
      return {
        title: 'Resolved past blockers',
        detail: [str(a.reason), blockers.length ? `Open: ${blockers.join(', ')}` : null].filter(Boolean).join(' · ') || null,
      };
    }
    case 'support.message.no_reply':
      return { title: 'Marked no reply required', detail: str(a.reason) };
    case 'support.reply':
      if (a.deliveryState === 'copied') return { title: 'Reply copied — not confirmed sent', detail: str(a.preview) };
      if (a.deliveryState === 'failed') return { title: 'Reply failed to send', detail: str(a.error) };
      return null;
    case 'support.reply.mark_sent':
      return { title: 'Copied reply marked sent', detail: null };
    default:
      return null;
  }
}
