/**
 * Repair service → Tasks board, the pure half (owner 2026-09-30: "View and
 * import all of the repair services. They are support tickets." — import +
 * keep in sync). Every OPEN repair owns exactly ONE task; the task closes when
 * the repair is done or picked up and reopens if the repair comes back.
 *
 * The idempotency key is the task's system-made REPAIR link (`RS-<id>`): the
 * reconcile finds a repair's task through it, never by guessing from text.
 */

import { TASK_NOTE_MAX } from './create-task-core';
import { isTaskDeskOpen, type TaskDeskStatus } from './task-desk-row';

/**
 * Who owns an imported repair, per org, lead first. Owner ruling 2026-09-30:
 * "Backfill the repair services that are not marked as done or picked up to
 * everyone including staff Lien, Thuc, Sang and Michael" — Michael leads.
 * Staff ids are per-org, so an org missing here imports nothing.
 */
export const REPAIR_TASK_OWNER_IDS: Readonly<Record<string, readonly number[]>> = {
  // Michael (lead) · Lien · Thuc · Sang
  '00000000-0000-0000-0000-000000000001': [1, 8, 2, 3],
};

/**
 * Stored `repair_service.status` values that END a repair. The owner's words
 * are "done or picked up": `Done`, plus the two Done-tab siblings (`Picked
 * Up`, `Shipped` — `REPAIR_DONE_TAB_STATUSES`) and the soft-delete
 * `Cancelled`, which no one should be chasing either.
 */
export const REPAIR_CLOSED_STATUSES = ['Done', 'Picked Up', 'Shipped', 'Cancelled'] as const;

/** SQL twin of {@link isRepairOpen} over a `repair_service` alias — one predicate, two spellings, pinned by the test. */
export function repairOpenSql(alias: string): string {
  const closed = REPAIR_CLOSED_STATUSES.map((status) => `'${status.replace(/'/g, "''")}'`).join(', ');
  return `(COALESCE(BTRIM(${alias}.status), '') NOT IN (${closed}) AND ${alias}.pickup_signed_at IS NULL)`;
}

/** One repair as the sync reads it. */
export interface RepairTaskSource {
  id: number;
  ticketNumber: string | null;
  productTitle: string | null;
  status: string | null;
  issue: string | null;
  /** `pickup_signed_at` — a signed pickup ends the repair whatever its status says. */
  pickedUp: boolean;
  /**
   * The helpdesk thread behind the paperwork number: `support_tickets` only,
   * exact org-scoped match on the number. `Ticket 10089` on a task row is
   * otherwise just words — the inline reply tab needs this to mount.
   */
  helpdeskTicketNumber: string | null;
}

/** A repair's task, found through its system-made REPAIR link. */
export interface RepairSyncTask {
  taskId: number;
  repairId: number;
  status: TaskDeskStatus;
  note: string | null;
  /**
   * True when this task's latest status change was the sync's own. Only a
   * sync close is undone by a sync reopen; an operator who marked the task
   * done while the repair is still open is not overruled.
   */
  closedBySync: boolean;
  /** The task already carries the helpdesk ticket link. */
  hasTicketLink: boolean;
}

export function isRepairOpen(repair: Pick<RepairTaskSource, 'status' | 'pickedUp'>): boolean {
  const status = (repair.status ?? '').trim();
  return !repair.pickedUp && !(REPAIR_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Tags stripped, whitespace collapsed — a plain line. */
function plain(raw: string | null | undefined): string {
  return (raw ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function repairFaceTitle(repair: Pick<RepairTaskSource, 'id' | 'productTitle'>): string {
  return plain(repair.productTitle) || `Repair RS-${repair.id}`;
}

/**
 * The task's words: `<product> — <status>`, then `Repair ticket <number>`,
 * then the customer's issue in plain text.
 */
export function repairTaskNote(repair: RepairTaskSource): string {
  const status = plain(repair.status) || 'No status';
  const ticket = plain(repair.ticketNumber) || `RS-${repair.id}`;
  const lines = [`${repairFaceTitle(repair)} — ${status}`, `Repair ticket ${ticket}`];
  const issue = plain(repair.issue);
  if (issue) lines.push(issue);
  const note = lines.join('\n');
  return note.length > TASK_NOTE_MAX ? note.slice(0, TASK_NOTE_MAX) : note;
}

/**
 * True when the note is still the sync's own words for this repair (any
 * status in line 1) — so a status move may rewrite it. An operator's edit
 * makes it theirs, and the sync leaves it alone.
 */
export function isSyncOwnedNote(note: string | null, repair: RepairTaskSource): boolean {
  if (note == null) return false;
  const ours = repairTaskNote(repair).split('\n');
  const theirs = note.split('\n');
  return (
    theirs.length === ours.length &&
    theirs[0].startsWith(`${repairFaceTitle(repair)} — `) &&
    theirs.slice(1).every((line, index) => line === ours[index + 1])
  );
}

export type RepairTaskAction =
  | { kind: 'create'; repairId: number; note: string; assigneeStaffIds: readonly number[]; ticketNumber: string | null }
  /** `note` is set only when the task still wears the sync's words and they changed. */
  | { kind: 'close'; taskId: number; repairId: number; note: string | null }
  | { kind: 'reopen'; taskId: number; repairId: number; note: string | null }
  | { kind: 'refresh'; taskId: number; repairId: number; note: string }
  /** The repair's paperwork number is a real helpdesk thread: link it so the record's Ticket tab replies inline. */
  | { kind: 'linkTicket'; taskId: number; repairId: number; ticketNumber: string };

/**
 * Decide, per repair, what its task needs. Repairs with no task that are
 * already closed are history and never imported. A CANCELED task was
 * withdrawn by a person and is left withdrawn (the desk cannot reopen one).
 */
export function planRepairTaskSync(
  repairs: readonly RepairTaskSource[],
  tasks: readonly RepairSyncTask[],
  owners: readonly number[],
): RepairTaskAction[] {
  const byRepair = new Map<number, RepairSyncTask>();
  for (const task of [...tasks].sort((a, b) => a.taskId - b.taskId)) {
    // One task per repair; should two ever exist, the oldest is the repair's.
    if (!byRepair.has(task.repairId)) byRepair.set(task.repairId, task);
  }

  const actions: RepairTaskAction[] = [];
  for (const repair of [...repairs].sort((a, b) => a.id - b.id)) {
    const open = isRepairOpen(repair);
    const task = byRepair.get(repair.id);
    const note = repairTaskNote(repair);

    if (!task) {
      if (open && owners.length > 0) {
        actions.push({ kind: 'create', repairId: repair.id, note, assigneeStaffIds: owners, ticketNumber: repair.helpdeskTicketNumber });
      }
      continue;
    }
    if (task.status === 'CANCELED') continue;

    // The paperwork number is a real helpdesk thread: link it so the record's Ticket tab replies inline.
    if (repair.helpdeskTicketNumber && !task.hasTicketLink) {
      actions.push({ kind: 'linkTicket', taskId: task.taskId, repairId: repair.id, ticketNumber: repair.helpdeskTicketNumber });
    }

    const refreshed = task.note !== note && isSyncOwnedNote(task.note, repair) ? note : null;
    if (isTaskDeskOpen(task.status)) {
      if (!open) actions.push({ kind: 'close', taskId: task.taskId, repairId: repair.id, note: refreshed });
      else if (refreshed) actions.push({ kind: 'refresh', taskId: task.taskId, repairId: repair.id, note: refreshed });
      continue;
    }
    // DONE.
    if (open && task.closedBySync) {
      actions.push({ kind: 'reopen', taskId: task.taskId, repairId: repair.id, note: refreshed });
    } else if (!open && refreshed) {
      actions.push({ kind: 'refresh', taskId: task.taskId, repairId: repair.id, note: refreshed });
    }
  }
  return actions;
}

/** Storage seam, bound to one org. */
export interface RepairTaskSyncDeps {
  /** Every repair in scope: open ones plus any that already own a task. */
  listRepairs(): Promise<RepairTaskSource[]>;
  /** Tasks carrying a system-made REPAIR link to a repair in scope. */
  listRepairTasks(): Promise<RepairSyncTask[]>;
  /** House create + REPAIR link, audited. False when refused. */
  createTask(action: Extract<RepairTaskAction, { kind: 'create' }>): Promise<boolean>;
  /** House status/note writer, audited. False when refused. */
  updateTask(
    action: Exclude<RepairTaskAction, { kind: 'create' } | { kind: 'linkTicket' }>,
  ): Promise<boolean>;
  /** House ticket-link writer, audited. False when refused (a duplicate counts as done). */
  linkTicket(action: Extract<RepairTaskAction, { kind: 'linkTicket' }>): Promise<boolean>;
}

export interface RepairTaskSyncSummary {
  repairs: number;
  created: number;
  closed: number;
  reopened: number;
  refreshed: number;
  ticketLinked: number;
  failed: number;
}

export interface RepairTaskSyncResult {
  summary: RepairTaskSyncSummary;
  actions: RepairTaskAction[];
}

/** Plan, then (unless `dryRun`) apply one action at a time; a refusal counts as failed and never stops the pass. */
export async function runRepairTaskSync(
  owners: readonly number[],
  deps: RepairTaskSyncDeps,
  opts: { dryRun?: boolean } = {},
): Promise<RepairTaskSyncResult> {
  const [repairs, tasks] = await Promise.all([deps.listRepairs(), deps.listRepairTasks()]);
  const actions = planRepairTaskSync(repairs, tasks, owners);
  const summary: RepairTaskSyncSummary = { repairs: repairs.length, created: 0, closed: 0, reopened: 0, refreshed: 0, ticketLinked: 0, failed: 0 };
  const counter = { create: 'created', close: 'closed', reopen: 'reopened', refresh: 'refreshed', linkTicket: 'ticketLinked' } as const;

  for (const action of actions) {
    if (opts.dryRun) {
      summary[counter[action.kind]] += 1;
      continue;
    }
    let ok = false;
    try {
      ok =
        action.kind === 'create'
          ? await deps.createTask(action)
          : action.kind === 'linkTicket'
            ? await deps.linkTicket(action)
            : await deps.updateTask(action);
    } catch (error) {
      console.warn(`[repair-tasks] ${action.kind} RS-${action.repairId} failed:`, error instanceof Error ? error.message : error);
    }
    if (ok) summary[counter[action.kind]] += 1;
    else summary.failed += 1;
  }
  return { summary, actions };
}
