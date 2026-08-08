import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
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
    async insertTask(args: InsertTaskArgs): Promise<TaskRow> {
      const result = await tenantQuery<{
        id: number;
        entity_id: string | number;
        priority: number;
        notes: string | null;
      }>(
        organizationId,
        `INSERT INTO work_assignments
           (organization_id, entity_type, entity_id, work_type,
            assignee_staff_id, assigned_by_staff_id, status, priority, notes)
         VALUES ($1, $2::work_entity_type_enum, $3, $4::work_type_enum,
                 $5, $6, $7::assignment_status_enum, $8, $9)
         RETURNING id, entity_id, priority, notes`,
        [
          organizationId,
          taskEntityEnum(args.entityType),
          args.entityId,
          TASK_WORK_TYPE,
          args.assigneeStaffId,
          args.assignedByStaffId,
          args.status,
          args.priority,
          args.note,
        ],
      );

      const row = result.rows[0];
      return {
        id: Number(row.id),
        entityType: args.entityType,
        // entity_id is BIGINT since 2026-08-08b, and node-postgres returns
        // bigint as a STRING to avoid silent precision loss. Number() here is
        // safe for real ids and keeps the DTO numeric for every caller.
        entityId: Number(row.entity_id),
        assigneeStaffId: args.assigneeStaffId,
        priority: row.priority,
        note: row.notes,
      };
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
    async notifyAssignee({ task, actorStaffId, urgent }: NotifyAssigneeArgs): Promise<void> {
      const inserted = await tenantQuery<{ id: number }>(
        organizationId,
        ASSIGN_INBOX_ITEM_SQL,
        assignInboxItemParams(organizationId, {
          staffId: task.assigneeStaffId,
          entityType: task.entityType,
          entityId: task.entityId,
          workAssignmentId: task.id,
          actorStaffId,
          note: task.note,
          urgent,
        }) as unknown[],
      );

      const itemId = inserted.rows[0]?.id;
      if (itemId == null) return;

      await publishInboxItem({
        organizationId,
        recipientId: task.assigneeStaffId,
        itemId: Number(itemId),
        entityType: task.entityType,
        entityId: task.entityId,
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
