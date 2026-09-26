import 'server-only';

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { promoteUrgency } from '@/lib/urgency/promote-urgency';
import { publishInboxItem } from '@/lib/realtime/publish';
import {
  ASSIGN_INBOX_ITEM_SQL,
  assignInboxItemParams,
} from '@/lib/notifications/assign-inbox-item';
import { WORK_TASK_ASSIGNED } from '@/lib/notifications/event-vocabulary';

import { TASK_WORK_TYPE, taskEntityEnum, type TaskEntityType } from './task-vocabulary';
import type {
  CreateTaskDeps,
  InsertTaskArgs,
  NotifyAssigneeArgs,
  PromoteOutcome,
  TaskRow,
} from './create-task-core';

/**
 * Real bindings for throwing a task.
 *
 * Two things worth knowing about the insert:
 *
 * 1. It writes `assignee_staff_id` DIRECTLY and leaves the two station slots
 *    NULL. `fn_sync_work_assignment_assignee()` (2026-08-08b) returns FOLLOW_UP
 *    rows untouched precisely so this column is authoritative for a thrown
 *    task, where it is derived for station work.
 *
 * 2. It is a plain INSERT with no find-active-and-update, unlike
 *    `POST /api/assignments`. That route upserts because a bench runs one entity
 *    at a time; a thrown task is exempt from `ux_work_assignments_active_entity`
 *    (2026-08-08b) exactly so two people can be handed the same record for
 *    different reasons. Reusing that route's upsert would have silently
 *    hijacked an existing task instead of creating a second one.
 */
export function createTaskDeps(organizationId: OrgId): CreateTaskDeps {
  return {
    async insertTask(args: InsertTaskArgs): Promise<TaskRow | null> {
      return withTenantTransaction(organizationId, async (client) => {
        const staff = await client.query(
          `SELECT id FROM staff WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
          [organizationId, args.assigneeStaffIds],
        );
        if (staff.rowCount !== args.assigneeStaffIds.length) return null;
        const result = await client.query<{
          id: number;
          entity_id: string | number;
          priority: number;
          notes: string | null;
        }>(
          `INSERT INTO work_assignments
             (organization_id, entity_type, entity_id, work_type,
              assignee_staff_id, assigned_by_staff_id, status, priority, notes,
              deadline_at, remind_at, project_name)
           VALUES ($1, $2::work_entity_type_enum, $3, $4::work_type_enum,
                   $5, $6, $7::assignment_status_enum, $8, $9,
                   $10::timestamptz, $11::timestamptz, $12)
           RETURNING id, entity_id, priority, notes`,
          [
            organizationId,
            args.entityType == null ? null : taskEntityEnum(args.entityType),
            args.entityId,
            TASK_WORK_TYPE,
            args.assigneeStaffId,
            args.assignedByStaffId,
            args.status,
            args.priority,
            args.note,
            args.deadlineAt,
            args.remindAt,
            args.projectName,
          ],
        );

        const row = result.rows[0];
        await client.query(
          `INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
           SELECT $1::uuid, $2, unnest($3::int[])`,
          [organizationId, row.id, args.assigneeStaffIds],
        );
        return {
          id: Number(row.id),
          entityType: args.entityType,
          // entity_id is BIGINT since 2026-08-08b, and node-postgres returns
          // bigint as a STRING to avoid silent precision loss. Number() here is
          // safe for real ids and keeps the DTO numeric for every caller.
          entityId: row.entity_id == null ? null : Number(row.entity_id),
          assigneeStaffId: args.assigneeStaffId,
          assigneeStaffIds: args.assigneeStaffIds,
          projectName: args.projectName,
          priority: row.priority,
          note: row.notes,
        };
      });
    },

    /**
     * Durable row first, live push second — in that order, always.
     *
     * The Ably message is a MIRROR of `staff_inbox_items`, so a dropped push
     * costs latency while the row still shows up on the recipient's next fetch.
     * Publishing first (or instead) would make delivery depend on a transport
     * with no retry and no persistence.
     *
     * `ON CONFLICT DO NOTHING` returns no row on a duplicate — that means this
     * task was already delivered to this staffer, so there is nothing new to
     * announce and the push is skipped rather than re-fired.
     */
    async notifyAssignee({ task, recipientStaffId, actorStaffId, urgent }: NotifyAssigneeArgs): Promise<void> {
      /**
       * One extra read, on the ticket arm only, so the inbox row can print the
       * number the operator quotes. `entity_id` stays the LOCAL registry id —
       * it is what the CHECK, the delete trigger and `?ticket=` are built on —
       * and the provider number rides the payload as a render hint. A failed
       * lookup degrades to the id, never to a wrong number.
       */
      const ticketNumber =
        task.entityType === 'support_ticket'
          ? await tenantQuery<{ external_ticket_id: string | null }>(
              organizationId,
              `SELECT external_ticket_id
                 FROM support_tickets
                WHERE organization_id = $1 AND id = $2
                LIMIT 1`,
              [organizationId, task.entityId],
            )
              .then((res) => {
                const raw = res.rows[0]?.external_ticket_id?.trim();
                const parsed = raw ? Number(raw) : NaN;
                return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
              })
              .catch(() => null)
          : null;

      // A standalone task has no record, so its inbox row anchors on the task
      // itself (migration 2026-09-25f); a record task keeps its record anchor.
      const anchor = task.entityType != null && task.entityId != null
        ? { entityType: task.entityType as string, entityId: task.entityId }
        : { entityType: 'task', entityId: task.id };
      const inserted = await tenantQuery<{ id: number }>(
        organizationId,
        ASSIGN_INBOX_ITEM_SQL,
        assignInboxItemParams(organizationId, {
          staffId: recipientStaffId,
          entityType: anchor.entityType,
          entityId: anchor.entityId,
          workAssignmentId: task.id,
          actorStaffId,
          note: task.note,
          urgent,
          ticketNumber,
        }) as unknown[],
      );

      const itemId = inserted.rows[0]?.id;
      if (itemId == null) return;

      await publishInboxItem({
        organizationId,
        recipientId: recipientStaffId,
        itemId: Number(itemId),
        entityType: anchor.entityType,
        entityId: anchor.entityId,
        eventKey: WORK_TASK_ASSIGNED,
        actorStaffId,
        note: task.note,
        urgent,
      });
    },

    async promoteUrgency(entityType: TaskEntityType, entityId: number): Promise<PromoteOutcome> {
      const result = await promoteUrgency(organizationId, { entityType, entityId });
      return result.ok
        ? { ok: true, changed: result.changed }
        : { ok: false, reason: result.reason };
    },
  };
}
