/**
 * Contract rule 3: an open Support primary task whose next follow-up is due
 * alerts its owners ONCE per due instant — the alert key carries the instant,
 * so a re-run of the sweep is a no-op and a re-scheduled chase alerts again.
 */
import { scrubRelayAddresses, supportContactLine, type SupportContactInput } from '@/lib/support/contact-face';
import type { OrgId } from '@/lib/tenancy/constants';

export interface DueSupportTask {
  taskId: number;
  supportItemId: number;
  /** ISO instant of work_assignments.next_follow_up_at. */
  nextFollowUpAt: string;
  subject: string | null;
  /** Raw requester fields (data); the note prints them only through the contact face. */
  requester: SupportContactInput;
}

export interface SupportFollowUpDueDeps {
  /** Wake items whose snooze has passed (back to open). */
  wakeSnoozed(orgId: OrgId, nowMs: number): Promise<number>;
  /** Open SUPPORT_TICKET primary tasks with next_follow_up_at <= now, item not resolved / still snoozed. */
  listDue(orgId: OrgId, nowMs: number): Promise<DueSupportTask[]>;
  /** Alert the task's owners; returns the staff who got a NEW row (empty on a replayed key). */
  alert(orgId: OrgId, args: { taskId: number; alertKey: string; note: string; dueAt: string; actorStaffId: null }): Promise<number[]>;
}

/** One alert per task per due instant. */
export function supportFollowUpDueAlertKey(taskId: number, nextFollowUpAt: string): string {
  return `support-follow-up-due:${taskId}:${Date.parse(nextFollowUpAt)}`;
}

/** The alert note: the item's subject (else its local number) and the customer's face — never a relay address, never "Ticket N". */
export function supportFollowUpDueNote(t: Pick<DueSupportTask, 'supportItemId' | 'subject' | 'requester'>): string {
  const subject = t.subject?.trim() ? scrubRelayAddresses(t.subject.trim()) : `Support #${t.supportItemId}`;
  const contact = supportContactLine(t.requester);
  return `Follow-up due · ${subject}${contact ? ` · ${contact}` : ''}`;
}

export async function runSupportFollowUpDueSweepCore(
  orgId: OrgId,
  nowMs: number,
  deps: SupportFollowUpDueDeps,
): Promise<{ alerted: number; tasks: number[] }> {
  await deps.wakeSnoozed(orgId, nowMs);
  const due = await deps.listDue(orgId, nowMs);
  const tasks: number[] = [];
  for (const t of due) {
    const note = supportFollowUpDueNote(t);
    const delivered = await deps.alert(orgId, {
      taskId: t.taskId,
      alertKey: supportFollowUpDueAlertKey(t.taskId, t.nextFollowUpAt),
      note,
      dueAt: t.nextFollowUpAt,
      actorStaffId: null,
    });
    if (delivered.length > 0) tasks.push(t.taskId);
  }
  return { alerted: tasks.length, tasks };
}
