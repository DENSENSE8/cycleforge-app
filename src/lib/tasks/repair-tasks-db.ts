import 'server-only';

/**
 * Repair service → Tasks board, the real bindings: the house task writer
 * (`createTask`, the core behind POST /api/tasks), the house link writer and
 * the desk's status writer (`patchTaskDeskRow`), each audited as the system
 * actor (`source: 'repair-task-sync'`, `method: 'system'`, no staff).
 */

import { setTimeout as sleep } from 'node:timers/promises';

import pool, { lockPool } from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY, type RecordAuditArgs } from '@/lib/audit-logs';
import { scheduleAfterResponse } from '@/lib/next/schedule-after-response';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getTicket, searchTickets } from '@/lib/zendesk';

import { createTask } from './create-task';
import { createTaskDeps } from './create-task-deps';
import { patchTaskDeskRow } from './list-tasks-db';
import type { TaskDeskPatch } from './list-tasks';
import { createTaskLink } from './task-links-db';
import { isTaskDeskStatus } from './task-desk-row';
import {
  REPAIR_TASK_OWNER_IDS,
  isRepairOwnTicket,
  repairIdInTicketSubject,
  repairOpenSql,
  runRepairTaskSync,
  type RepairSyncTask,
  type RepairTaskAction,
  type RepairTaskSource,
  type RepairTaskSyncDeps,
  type RepairTaskSyncResult,
} from './repair-tasks';

/** The audit `source` every sync write carries — and how a later pass recognises its own close. */
const SYNC_SOURCE = 'repair-task-sync';

/** Give up waiting for another pass on the same org after this long. */
const LOCK_WAIT_MS = 60_000;
const LOCK_RETRY_MS = 250;

/**
 * Serialize passes per org: a create is "no task yet → insert", so two passes
 * on one repair (an after() hook racing the cron) must never interleave.
 * Session advisory lock on the direct pool (see `lockPool`); the connection is
 * returned between attempts so waiters never pin the pool.
 */
async function withOrgSyncLock<T>(orgId: OrgId, fn: () => Promise<T>): Promise<T> {
  const key = `repair_task_sync:${orgId}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const client = await lockPool.connect();
    try {
      const got = await client.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS locked`, [key]);
      if (got.rows[0]?.locked) {
        try {
          return await fn();
        } finally {
          await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]).catch(() => {});
        }
      }
    } finally {
      client.release();
    }
    if (Date.now() > deadline) throw new Error(`repair task sync for ${orgId} is still busy after ${LOCK_WAIT_MS}ms`);
    await sleep(LOCK_RETRY_MS);
  }
}

/** Link rows the sync made (`created_by_staff_id IS NULL`) are the key; an operator's own repair link never is. */
function repairTaskSyncDeps(orgId: OrgId, repairId: number | null): RepairTaskSyncDeps {
  const audit = (args: Omit<RecordAuditArgs, 'source'>) =>
    recordAudit(pool, null, null, { ...args, source: SYNC_SOURCE, method: 'system', organizationIdOverride: orgId });

  return {
    async listRepairs(): Promise<RepairTaskSource[]> {
      const res = await tenantQuery<{
        id: number;
        ticket_number: string | null;
        product_title: string | null;
        status: string | null;
        issue: string | null;
        picked_up: boolean;
        helpdesk_ticket_number: string | null;
      }>(
        orgId,
        `SELECT rs.id, rs.ticket_number, rs.product_title, rs.status, rs.issue,
                rs.pickup_signed_at IS NOT NULL AS picked_up,
                st.external_ticket_id AS helpdesk_ticket_number
           FROM repair_service rs
           LEFT JOIN support_tickets st
             ON st.organization_id = rs.organization_id
            -- A leading hash on the slip ('#9977') is the counter's spelling of the same number.
            AND st.external_ticket_id = regexp_replace(rs.ticket_number, '^#', '')
          WHERE rs.organization_id = $1::uuid
            AND ($2::int IS NULL OR rs.id = $2)
            AND (${repairOpenSql('rs')}
                 OR EXISTS (SELECT 1
                              FROM work_assignment_links l
                             WHERE l.organization_id = rs.organization_id
                               AND l.entity_type = 'REPAIR'
                               AND l.entity_id = rs.id
                               AND l.created_by_staff_id IS NULL))
          ORDER BY rs.id`,
        [orgId, repairId],
      );
      return res.rows.map((row) => ({
        id: Number(row.id),
        ticketNumber: row.ticket_number,
        productTitle: row.product_title,
        status: row.status,
        issue: row.issue,
        pickedUp: row.picked_up,
        helpdeskTicketNumber: /^\d+$/.test(row.helpdesk_ticket_number ?? '') ? row.helpdesk_ticket_number : null,
      }));
    },

    async listRepairTasks(): Promise<RepairSyncTask[]> {
      const res = await tenantQuery<{
        task_id: number;
        repair_id: string | number;
        status: string;
        notes: string | null;
        closed_by_sync: boolean;
        has_ticket_link: boolean;
      }>(
        orgId,
        `SELECT wa.id AS task_id, l.entity_id AS repair_id, wa.status::text AS status, wa.notes,
                EXISTS (SELECT 1
                          FROM work_assignment_links tl
                         WHERE tl.organization_id = l.organization_id
                           AND tl.assignment_id = wa.id
                           AND tl.entity_type = 'SUPPORT_TICKET') AS has_ticket_link,
                COALESCE(last_status.source = $3, false) AS closed_by_sync
           FROM work_assignment_links l
           JOIN work_assignments wa
             ON wa.organization_id = l.organization_id
            AND wa.id = l.assignment_id
            AND wa.work_type = 'FOLLOW_UP'::work_type_enum
           LEFT JOIN LATERAL (
             SELECT a.source
               FROM audit_logs a
              WHERE a.entity_type = $4
                AND a.entity_id = wa.id::text
                AND a.organization_id = wa.organization_id
                AND a.action = $5
                AND a.metadata -> 'changed' ? 'status'
              ORDER BY a.created_at DESC, a.id DESC
              LIMIT 1
           ) last_status ON TRUE
          WHERE l.organization_id = $1::uuid
            AND l.entity_type = 'REPAIR'
            AND l.created_by_staff_id IS NULL
            AND ($2::bigint IS NULL OR l.entity_id = $2)`,
        [orgId, repairId, SYNC_SOURCE, AUDIT_ENTITY.WORK_ASSIGNMENT, AUDIT_ACTION.WORK_TASK_UPDATE],
      );
      const tasks: RepairSyncTask[] = [];
      for (const row of res.rows) {
        if (!isTaskDeskStatus(row.status)) continue;
        tasks.push({
          taskId: Number(row.task_id),
          repairId: Number(row.repair_id),
          status: row.status,
          note: row.notes,
          closedBySync: row.closed_by_sync,
          hasTicketLink: row.has_ticket_link,
        });
      }
      return tasks;
    },

    async createTask(action) {
      // Imported work, not a handoff: the owners see it on the board (Mine and
      // Everyone), so the throw's per-assignee inbox row is not sent — a
      // backfill would otherwise drop one per repair per owner in four inboxes.
      const result = await createTask(
        orgId,
        {
          entityType: null,
          entityId: null,
          assigneeStaffIds: [...action.assigneeStaffIds],
          assigneeStaffId: action.assigneeStaffIds[0],
          note: action.note,
          urgency: 'normal',
          actorStaffId: null,
        },
        { ...createTaskDeps(orgId), notifyAssignee: async () => {} },
      );
      if (!result.ok) {
        console.warn(`[repair-tasks] org ${orgId} RS-${action.repairId}: create refused (${result.reason})`);
        return false;
      }
      await audit({
        action: AUDIT_ACTION.WORK_TASK_THROW,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: result.task.id,
        extra: {
          targetEntityType: null,
          targetEntityId: null,
          assigneeStaffId: result.task.assigneeStaffId,
          assigneeStaffIds: result.task.assigneeStaffIds,
          projectName: result.task.projectName,
          urgency: result.urgency,
          notified: 'suppressed',
          repairId: action.repairId,
        },
      });

      const link = await createTaskLink(orgId, null, result.task.id, { kind: 'repair', value: `RS-${action.repairId}` });
      if (!link.ok) {
        // A task without its key would be re-created next pass: withdraw it.
        console.warn(`[repair-tasks] org ${orgId} RS-${action.repairId}: link refused (${link.reason}); withdrawing task ${result.task.id}`);
        await patchAudited(result.task.id, { status: 'CANCELED' }, action.repairId, 'link_failed');
        return false;
      }
      if (link.created) {
        await audit({
          action: AUDIT_ACTION.WORK_TASK_LINK_ADD,
          entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
          entityId: result.task.id,
          after: { linkId: link.link.id, entityId: link.link.entityId },
          extra: { kind: link.link.kind, label: link.link.label, repairId: action.repairId },
        });
      }
      if (action.ticketNumber != null) {
        const ticket = await createTaskLink(orgId, null, result.task.id, { kind: 'ticket', value: action.ticketNumber });
        if (ticket.ok && ticket.created) {
          await audit({
            action: AUDIT_ACTION.WORK_TASK_LINK_ADD,
            entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
            entityId: result.task.id,
            after: { linkId: ticket.link.id, entityId: ticket.link.entityId },
            extra: { kind: ticket.link.kind, label: ticket.link.label, repairId: action.repairId },
          });
        }
      }
      return true;
    },

    linkTicket: (action) => linkHelpdeskTicket(action.taskId, action.repairId, action.ticketNumber),

    async findTicket(action) {
      // The slip's number first: one GET, kept only if the subject proves it is this repair's thread.
      if (action.paperworkNumber != null) {
        const ticket = await getTicket(action.paperworkNumber, orgId);
        if (ticket && isRepairOwnTicket(action.repairId, ticket.subject)) {
          return (await linkHelpdeskTicket(action.taskId, action.repairId, String(ticket.id))) ? 'linked' : 'refused';
        }
      }
      // No usable number on the slip (`RS-0053`): the helpdesk subject names the repair (`Repair RS 53: …`).
      const { results } = await searchTickets(`"RS ${action.repairId}"`, { perPage: 10 }, orgId);
      const own = results.filter((ticket) => repairIdInTicketSubject(ticket.subject) === action.repairId);
      if (own.length !== 1) return 'unmatched';
      return (await linkHelpdeskTicket(action.taskId, action.repairId, String(own[0].id))) ? 'linked' : 'refused';
    },

    async updateTask(action) {
      const patch: TaskDeskPatch = {};
      if (action.kind === 'close') patch.status = 'DONE';
      if (action.kind === 'reopen') patch.status = 'OPEN';
      if (action.note != null) patch.note = action.note;
      return patchAudited(action.taskId, patch, action.repairId, action.kind);
    },
  };

  /** House ticket-link writer (mints the `support_tickets` mirror when the helpdesk confirms the number), audited. */
  async function linkHelpdeskTicket(taskId: number, repairId: number, ticketNumber: string): Promise<boolean> {
    const ticket = await createTaskLink(orgId, null, taskId, { kind: 'ticket', value: ticketNumber });
    if (!ticket.ok) {
      console.warn(`[repair-tasks] org ${orgId} task ${taskId}: ticket ${ticketNumber} link refused (${ticket.reason})`);
      return false;
    }
    if (ticket.created) {
      await audit({
        action: AUDIT_ACTION.WORK_TASK_LINK_ADD,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        after: { linkId: ticket.link.id, entityId: ticket.link.entityId },
        extra: { kind: ticket.link.kind, label: ticket.link.label, repairId },
      });
    }
    return true;
  }

  /** The desk's own patch + the route's audit shape, as the system actor. */
  async function patchAudited(
    taskId: number,
    patch: TaskDeskPatch,
    repairIdForAudit: number,
    reason: RepairTaskAction['kind'] | 'link_failed',
  ): Promise<boolean> {
    const result = await patchTaskDeskRow(orgId, taskId, patch, null);
    if (!result.ok) {
      console.warn(`[repair-tasks] org ${orgId} task ${taskId}: ${reason} refused (${result.reason})`);
      return false;
    }
    await audit({
      action: AUDIT_ACTION.WORK_TASK_UPDATE,
      entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
      entityId: result.task.id,
      before: {
        status: result.before.status,
        // Closing a held task clears its hold (trigger); the Timeline reads the pair.
        taskState: result.before.taskState,
        assigneeStaffId: result.before.assigneeStaffId,
        assigneeStaffIds: result.before.assigneeStaffIds,
        projectName: result.before.projectName,
      },
      after: {
        status: result.task.status,
        taskState: result.task.taskState,
        completedAt: result.task.completedAt,
        noteChanged: patch.note !== undefined,
      },
      extra: { changed: result.changed, repairId: repairIdForAudit, reason },
    });
    return true;
  }
}

/**
 * Reconcile one org (or one repair in it) against its repairs. A no-op for
 * an org with no owners in `REPAIR_TASK_OWNER_IDS`. `dryRun` plans without
 * writing.
 */
export async function syncRepairTasks(
  orgId: OrgId,
  opts: { repairId?: number; dryRun?: boolean } = {},
): Promise<RepairTaskSyncResult | null> {
  const owners = REPAIR_TASK_OWNER_IDS[orgId];
  if (!owners) return null;
  return withOrgSyncLock(orgId, () =>
    runRepairTaskSync(owners, repairTaskSyncDeps(orgId, opts.repairId ?? null), { dryRun: opts.dryRun }),
  );
}

/**
 * Post-commit hook for every repair writer (create, status, pickup): sync that
 * repair's task after the response. Outside a request (a script, a cron
 * helper) there is no `after()` scope, so it runs detached. Never throws — the
 * repair write already landed and the 15-minute reconcile is the safety net.
 */
export function scheduleRepairTaskSync(orgId: OrgId | null | undefined, repairId: number | null | undefined): void {
  if (!orgId || !repairId || !REPAIR_TASK_OWNER_IDS[orgId]) return;
  const work = async () => {
    await syncRepairTasks(orgId, { repairId });
  };
  try {
    scheduleAfterResponse(work);
  } catch {
    void work().catch((error) => console.warn(`[repair-tasks] sync RS-${repairId} failed:`, error));
  }
}
