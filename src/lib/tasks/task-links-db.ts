import 'server-only';

/** Real tenant bindings for task links (`work_assignment_links`), plus the task-existence gate the media upload routes use. */

import pool from '@/lib/db';
import { ApiError } from '@/lib/api';
import { findOrderByTrackingKey } from '@/lib/orders-exceptions';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveTicketTarget } from './resolve-ticket-target';
import {
  createTaskLink as createTaskLinkCore,
  deleteTaskLink as deleteTaskLinkCore,
  listTaskLinks as listTaskLinksCore,
  mapTaskLinkRow,
  type CreateTaskLinkResult,
  type TaskAnchor,
  type TaskLinksDeps,
} from './task-links';
import type { TaskLink, TaskLinkCreateBody, TaskLinkFace } from './task-links-shared';
import { TASK_WORK_TYPE, taskEntityFromEnum } from './task-vocabulary';
import { ticketTargetDbDeps } from './ticket-target-deps';

/** One statement per task: */
const TASK_LINKS_SQL = `
  SELECT l.id,
         l.assignment_id,
         l.entity_type,
         l.entity_id,
         l.label,
         l.created_at,
         l.created_by_staff_id,
         s.name                   AS created_by_name,
         fo.id                    AS order_id,
         NULLIF(BTRIM(fo.order_id), '') AS order_number,
         CASE WHEN fo.id IS NULL THEN NULL ELSE COALESCE(grp.line_count, 1) END AS order_line_count,
         fo.product_title         AS order_title,
         fo.sku                   AS order_sku,
         stn.carrier              AS tracking_carrier,
         stn.latest_status_category AS tracking_status,
         st.external_ticket_id    AS ticket_external_id,
         st.subject_cache         AS ticket_subject,
         st.status_cache          AS ticket_status
    FROM work_assignment_links l
    LEFT JOIN staff s
      ON s.id = l.created_by_staff_id
     AND s.organization_id = l.organization_id
    LEFT JOIN orders lo
      ON lo.organization_id = l.organization_id
     AND lo.id = CASE l.entity_type
                   WHEN 'ORDER' THEN l.entity_id
                   WHEN 'TRACKING' THEN l.resolved_order_id
                 END
    LEFT JOIN LATERAL (
      SELECT MIN(o.id) AS first_id, COUNT(*) AS line_count
        FROM orders o
       WHERE o.organization_id = lo.organization_id
         AND o.order_id = lo.order_id
    ) grp ON NULLIF(BTRIM(lo.order_id), '') IS NOT NULL
    LEFT JOIN orders fo
      ON fo.organization_id = l.organization_id
     AND fo.id = COALESCE(grp.first_id, lo.id)
    LEFT JOIN LATERAL (
      SELECT NULLIF(t.carrier, 'UNKNOWN') AS carrier,
             t.latest_status_category
        FROM shipping_tracking_numbers t
       WHERE l.entity_type = 'TRACKING'
         AND t.organization_id = l.organization_id
         AND t.tracking_number_normalized = l.label
       ORDER BY t.id DESC
       LIMIT 1
    ) stn ON TRUE
    LEFT JOIN support_tickets st
      ON l.entity_type = 'SUPPORT_TICKET'
     AND st.id = l.entity_id
     AND st.organization_id = l.organization_id
   WHERE l.organization_id = $1::uuid
     AND l.assignment_id = $2
     AND ($3::text IS NULL OR (l.entity_type = $3 AND l.label = $4))
   ORDER BY l.created_at, l.id`;

/** The anchor of a FOLLOW_UP task in this org, or null — the task-existence gate. */
export async function findTaskAnchor(orgId: OrgId, taskId: number): Promise<TaskAnchor | null> {
  const res = await tenantQuery<{ entity_type: string; entity_id: string | number }>(
    orgId,
    `SELECT entity_type::text AS entity_type, entity_id
       FROM work_assignments
      WHERE organization_id = $1::uuid AND id = $2 AND work_type::text = $3
      LIMIT 1`,
    [orgId, taskId, TASK_WORK_TYPE],
  );
  const row = res.rows[0];
  const entityType = row ? taskEntityFromEnum(row.entity_type) : null;
  // A row outside the task vocabulary is not a task the desk can show, so it
  // is not one links or media may hang off either.
  return row && entityType ? { entityType, entityId: Number(row.entity_id) } : null;
}

/** The deps seam bound to one org (and the acting staffer, for ticket mirrors). */
function taskLinksDbDeps(orgId: OrgId, staffId: number | null): TaskLinksDeps {
  return {
    findTaskAnchor: (taskId) => findTaskAnchor(orgId, taskId),

    async findOrder(orderId) {
      const res = await tenantQuery<{ id: number; order_number: string | null }>(
        orgId,
        `SELECT id, NULLIF(BTRIM(order_id), '') AS order_number
           FROM orders
          WHERE organization_id = $1::uuid AND id = $2
          LIMIT 1`,
        [orgId, orderId],
      );
      const row = res.rows[0];
      return row ? { id: Number(row.id), orderNumber: row.order_number } : null;
    },

    resolveTicket: (value) => resolveTicketTarget(value, ticketTargetDbDeps(orgId, staffId)),

    async findOrderIdByTracking(canonical) {
      const match = await findOrderByTrackingKey(canonical, pool, orgId);
      return match ? Number(match.id) : null;
    },

    async insertLink(row) {
      const res = await tenantQuery(
        orgId,
        `INSERT INTO work_assignment_links
           (organization_id, assignment_id, entity_type, entity_id, label,
            resolved_order_id, created_by_staff_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, assignment_id, entity_type, label) DO NOTHING
         RETURNING id`,
        [
          orgId,
          row.taskId,
          row.entityType,
          row.entityId,
          row.label,
          row.resolvedOrderId,
          row.createdByStaffId,
        ],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async readLinks(taskId, key) {
      const res = await tenantQuery(orgId, TASK_LINKS_SQL, [
        orgId,
        taskId,
        key?.entityType ?? null,
        key?.label ?? null,
      ]);
      const links: TaskLink[] = [];
      for (const raw of res.rows) {
        const link = mapTaskLinkRow(raw);
        if (link) links.push(link);
      }
      return links;
    },

    async deleteLink(taskId, linkId) {
      const res = await tenantQuery<{ entity_type: string; label: string }>(
        orgId,
        `DELETE FROM work_assignment_links
          WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
          RETURNING entity_type, label`,
        [orgId, taskId, linkId],
      );
      const row = res.rows[0];
      return row ? { entityType: row.entity_type, label: row.label } : null;
    },
  };
}

/** Links on one task, oldest first; null when the id is not a task in this org. */
export function listTaskLinks(orgId: OrgId, taskId: number): Promise<TaskLink[] | null> {
  return listTaskLinksCore(taskId, taskLinksDbDeps(orgId, null));
}

export function createTaskLink(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskLinkCreateBody,
): Promise<CreateTaskLinkResult> {
  return createTaskLinkCore(taskId, staffId, body, taskLinksDbDeps(orgId, staffId));
}

export function deleteTaskLink(
  orgId: OrgId,
  taskId: number,
  linkId: number,
): Promise<{ changed: boolean; face: TaskLinkFace | null } | null> {
  return deleteTaskLinkCore(taskId, linkId, taskLinksDbDeps(orgId, null));
}

/**
 * Media gate for `WORK_ASSIGNMENT` uploads: the id must be a FOLLOW_UP task
 * in the caller's org, so a photo or video can never hang off another org's
 * task or a number that is no task at all. 404 otherwise.
 */
export async function assertTaskInOrg(orgId: OrgId, taskId: number): Promise<void> {
  if (!(await findTaskAnchor(orgId, taskId))) throw ApiError.notFound('Task', taskId);
}
