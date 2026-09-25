/**
 * Task **links** — the pure half: which record a link names, the label it is
 * keyed by, and the refusals. The SQL and the helpdesk live behind
 * {@link TaskLinksDeps}, bound in `task-links-db.ts` (house split, see
 * `list-tasks.ts` / `list-tasks-db.ts`), so the branch table is DB-free.
 *
 * The wire vocabulary (kinds, faces, refusal copy) is `task-links-shared.ts`;
 * the table is `work_assignment_links` (2026-09-25b).
 *
 * ## The label is derived here, never taken from the request
 * `(organization_id, assignment_id, entity_type, label)` is the natural key.
 * Two operators linking the same order, one by pasting `112-…` and one by
 * scanning a line, must land on ONE row — so the label is always the resolved
 * record's own face: the order number (or `ID <orders.id>` when the line has
 * none), the provider ticket digits, the canonical tracking number.
 */

import { extractCanonicalTracking } from '@/lib/tracking-format';
import type { ResolveTicketTargetResult } from './resolve-ticket-target';
import type { TaskLink, TaskLinkCreateBody, TaskLinkFace, TaskLinkKind } from './task-links-shared';
import type { TaskEntityType } from './task-vocabulary';

/** `work_assignment_links.entity_type`, per wire kind. */
export const TASK_LINK_ENTITY_TYPE = {
  order: 'ORDER',
  tracking: 'TRACKING',
  ticket: 'SUPPORT_TICKET',
} as const satisfies Record<TaskLinkKind, string>;

export type TaskLinkEntityType = (typeof TASK_LINK_ENTITY_TYPE)[TaskLinkKind];

const KIND_BY_ENTITY_TYPE = Object.fromEntries(
  Object.entries(TASK_LINK_ENTITY_TYPE).map(([kind, entityType]) => [entityType, kind]),
) as Record<string, TaskLinkKind>;

/** Shortest value a carrier number can be; anything shorter is a typo, not a parcel. */
export const TASK_LINK_TRACKING_MIN = 8;
/** `work_assignment_links_label_len` — the CHECK's upper bound. */
export const TASK_LINK_LABEL_MAX = 200;

export type TaskLinkRefusal =
  | 'task_not_found'
  | 'order_not_found'
  | 'invalid_tracking'
  | 'invalid_number'
  | 'not_found'
  | 'helpdesk_unavailable'
  | 'anchor_duplicate';

/** The task a link hangs off, as the anchor-duplicate rule needs it. */
export interface TaskAnchor {
  entityType: TaskEntityType;
  entityId: number;
}

export interface NewTaskLinkRow {
  taskId: number;
  entityType: TaskLinkEntityType;
  entityId: number | null;
  label: string;
  resolvedOrderId: number | null;
  createdByStaffId: number | null;
}

/** Org-scoped seam. Every method is already bound to the caller's org. */
export interface TaskLinksDeps {
  /** The anchor of a FOLLOW_UP task in this org, or null. */
  findTaskAnchor(taskId: number): Promise<TaskAnchor | null>;
  /** An `orders` row in this org and its order number, or null. */
  findOrder(orderId: number): Promise<{ id: number; orderNumber: string | null } | null>;
  /** `resolveTicketTarget` bound to this org's registry + helpdesk. */
  resolveTicket(value: string): Promise<ResolveTicketTargetResult>;
  /** The org order a canonical tracking number belongs to, or null. */
  findOrderIdByTracking(canonical: string): Promise<number | null>;
  /** INSERT … ON CONFLICT DO NOTHING on the natural key; true when a row landed. */
  insertLink(row: NewTaskLinkRow): Promise<boolean>;
  /** Enriched links on one task, oldest first; `key` narrows to one natural key. */
  readLinks(
    taskId: number,
    key?: { entityType: TaskLinkEntityType; label: string },
  ): Promise<TaskLink[]>;
  /** DELETE … RETURNING; the removed row's key, or null when nothing matched. */
  deleteLink(taskId: number, linkId: number): Promise<{ entityType: string; label: string } | null>;
}

export type CreateTaskLinkResult =
  | {
      ok: true;
      /** false when the natural key already existed — the idempotent replay. */
      created: boolean;
      link: TaskLink;
      /** Set when resolving a ticket minted its registry mirror (audited by the route). */
      registeredTicket: { supportTicketId: number; providerTicketId: number } | null;
    }
  | { ok: false; reason: TaskLinkRefusal };

type LinkTarget =
  | {
      ok: true;
      row: Omit<NewTaskLinkRow, 'taskId' | 'createdByStaffId'>;
      registeredTicket: { supportTicketId: number; providerTicketId: number } | null;
    }
  | { ok: false; reason: TaskLinkRefusal };

/** Resolve a create body to the row it names — or the refusal the operator reads. */
async function resolveLinkTarget(
  anchor: TaskAnchor,
  body: TaskLinkCreateBody,
  deps: TaskLinksDeps,
): Promise<LinkTarget> {
  switch (body.kind) {
    case 'order': {
      const order = await deps.findOrder(body.entityId);
      if (!order) return { ok: false, reason: 'order_not_found' };
      if (anchor.entityType === 'order' && anchor.entityId === order.id) {
        return { ok: false, reason: 'anchor_duplicate' };
      }
      const orderNumber = order.orderNumber?.trim();
      return {
        ok: true,
        row: {
          entityType: TASK_LINK_ENTITY_TYPE.order,
          entityId: order.id,
          label: (orderNumber || `ID ${order.id}`).slice(0, TASK_LINK_LABEL_MAX),
          resolvedOrderId: null,
        },
        registeredTicket: null,
      };
    }
    case 'ticket': {
      const resolved = await deps.resolveTicket(body.value);
      if (!resolved.ok) return { ok: false, reason: resolved.reason };
      if (anchor.entityType === 'support_ticket' && anchor.entityId === resolved.supportTicketId) {
        return { ok: false, reason: 'anchor_duplicate' };
      }
      return {
        ok: true,
        row: {
          entityType: TASK_LINK_ENTITY_TYPE.ticket,
          entityId: resolved.supportTicketId,
          label: String(resolved.providerTicketId),
          resolvedOrderId: null,
        },
        registeredTicket: resolved.registered
          ? { supportTicketId: resolved.supportTicketId, providerTicketId: resolved.providerTicketId }
          : null,
      };
    }
    case 'tracking': {
      const canonical = extractCanonicalTracking(body.value);
      if (canonical.length < TASK_LINK_TRACKING_MIN || canonical.length > TASK_LINK_LABEL_MAX) {
        return { ok: false, reason: 'invalid_tracking' };
      }
      return {
        ok: true,
        row: {
          entityType: TASK_LINK_ENTITY_TYPE.tracking,
          entityId: null,
          label: canonical,
          resolvedOrderId: await deps.findOrderIdByTracking(canonical),
        },
        registeredTicket: null,
      };
    }
  }
}

/**
 * Link one record to a task. Idempotent on the natural key: a second call for
 * the same (task, kind, label) inserts nothing and answers the existing row
 * with `created: false`.
 */
export async function createTaskLink(
  taskId: number,
  staffId: number | null,
  body: TaskLinkCreateBody,
  deps: TaskLinksDeps,
): Promise<CreateTaskLinkResult> {
  const anchor = await deps.findTaskAnchor(taskId);
  if (!anchor) return { ok: false, reason: 'task_not_found' };

  const target = await resolveLinkTarget(anchor, body, deps);
  if (!target.ok) return target;

  const created = await deps.insertLink({ ...target.row, taskId, createdByStaffId: staffId });
  const [link] = await deps.readLinks(taskId, {
    entityType: target.row.entityType,
    label: target.row.label,
  });
  if (!link) {
    // Inserted (or already present) and then not readable: the task was
    // deleted mid-call, taking the link with it through the FK cascade.
    return { ok: false, reason: 'task_not_found' };
  }
  return { ok: true, created, link, registeredTicket: target.registeredTicket };
}

/** Links on one task, or null when the id is not a task in this org. */
export async function listTaskLinks(taskId: number, deps: TaskLinksDeps): Promise<TaskLink[] | null> {
  if (!(await deps.findTaskAnchor(taskId))) return null;
  return deps.readLinks(taskId);
}

/**
 * Unlink one record. `changed: false` (face null) when the link was already
 * gone — a double-tapped remove; null when the task itself is not in this org.
 */
export async function deleteTaskLink(
  taskId: number,
  linkId: number,
  deps: TaskLinksDeps,
): Promise<{ changed: boolean; face: TaskLinkFace | null } | null> {
  if (!(await deps.findTaskAnchor(taskId))) return null;
  const removed = await deps.deleteLink(taskId, linkId);
  const kind = removed ? KIND_BY_ENTITY_TYPE[removed.entityType] : undefined;
  return {
    changed: removed != null,
    face: removed && kind ? { kind, label: removed.label } : null,
  };
}

// ── row mapping ─────────────────────────────────────────────────────────────

/** The columns `task-links-db.ts` selects. Kept here so the mapper is testable. */
export interface TaskLinkSqlRow {
  id: unknown;
  assignment_id: unknown;
  entity_type: unknown;
  entity_id: unknown;
  label: unknown;
  created_at: unknown;
  created_by_staff_id: unknown;
  created_by_name: unknown;
  order_id: unknown;
  order_number: unknown;
  order_line_count: unknown;
  order_title: unknown;
  order_sku: unknown;
  tracking_carrier: unknown;
  tracking_status: unknown;
  ticket_external_id: unknown;
  ticket_subject: unknown;
  ticket_status: unknown;
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

/** One SQL row → one wire link; null for a discriminator the TS does not know. */
export function mapTaskLinkRow(raw: Record<string, unknown>): TaskLink | null {
  const row = raw as unknown as TaskLinkSqlRow;
  const kind = typeof row.entity_type === 'string' ? KIND_BY_ENTITY_TYPE[row.entity_type] : undefined;
  const id = intOrNull(row.id);
  const taskId = intOrNull(row.assignment_id);
  if (!kind || id == null || taskId == null) return null;

  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString();
  const createdById = intOrNull(row.created_by_staff_id);
  const orderId = intOrNull(row.order_id);

  return {
    id,
    taskId,
    kind,
    entityId: intOrNull(row.entity_id),
    label: String(row.label ?? ''),
    createdAt,
    createdBy:
      createdById == null
        ? null
        : { id: createdById, name: textOrNull(row.created_by_name)?.trim() || `Staff #${createdById}` },
    order:
      orderId == null
        ? null
        : {
            id: orderId,
            orderNumber: textOrNull(row.order_number),
            lineCount: intOrNull(row.order_line_count) ?? 1,
            title: textOrNull(row.order_title),
            sku: textOrNull(row.order_sku),
          },
    tracking:
      kind === 'tracking'
        ? { carrier: textOrNull(row.tracking_carrier), status: textOrNull(row.tracking_status) }
        : null,
    ticket:
      kind === 'ticket'
        ? {
            providerTicketId: intOrNull(row.ticket_external_id),
            subject: textOrNull(row.ticket_subject),
            status: textOrNull(row.ticket_status),
          }
        : null,
  };
}
