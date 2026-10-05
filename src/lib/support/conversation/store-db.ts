import 'server-only';

/**
 * The real {@link SupportStore}: every method runs on the ONE tenant
 * transaction client `supportTransaction` opens (explicit
 * `organization_id = $1` on every statement as well as the RLS GUC).
 */
import type { PoolClient } from 'pg';

import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { parseTaskHold } from '@/design-system/tokens/task-status';
import { enqueueSupportDraft, markSupportDraftUsed, staleSupportDrafts } from '@/lib/support/drafts/store';
import { linkSupportItemOrders } from '@/lib/support/orders/link-orders';
import { closeOrderCheckInForItem, refreshOrderCheckInForItem } from '@/lib/support/check-ins/projection';
import { isTaskDeskStatus } from '@/lib/tasks/task-desk-row';
import { logTaskFollowUpInTx } from '@/lib/tasks/task-follow-ups-db';
import { patchTaskDeskRowInTx } from '@/lib/tasks/list-tasks';
import { TASK_INITIAL_STATUS, TASK_WORK_TYPE, taskEntityEnum } from '@/lib/tasks/task-vocabulary';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

import type { SupportEntityLinkType } from './ingest-types';
import type {
  DeliveryState,
  ReplyDisposition,
  SupportChannel,
  SupportItemKind,
  SupportLifecycle,
  SupportMessageDirection,
  SupportMessageProvider,
  SupportPurpose,
  SupportPurposeSource,
} from './model';
import type {
  StoredSupportMessage,
  SupportItemRow,
  SupportStore,
  SupportTaskRow,
  SupportTransaction,
} from './store';
import { SupportInputError } from './store';

type Row = Record<string, unknown>;

const ITEM_COLS = `id, kind, provider, external_ticket_id, subject_cache, purpose, purpose_source,
  purpose_acknowledged_at, lifecycle, snoozed_until, requester_email, account_label,
  primary_task_id, pending_inbound_count, resolved_at`;

const MESSAGE_COLS = `m.id, m.thread_id, t.entity_id AS support_item_id, m.direction, m.provider, m.body,
  COALESCE(m.occurred_at, m.created_at) AS occurred_at, m.author_staff_id, m.reply_disposition,
  m.delivery_state, m.external_message_id, m.client_event_id, m.meta`;

/** The parent table of each `ticket_links` entity a Support item may point at (app-side existence check). */
const ENTITY_PARENT: Readonly<Record<SupportEntityLinkType, string>> = {
  REPAIR: 'repair_service',
  RECEIVING: 'receiving',
  RECEIVING_LINE: 'receiving_lines',
  SERIAL_UNIT: 'serial_units',
  SHIPMENT: 'shipping_tracking_numbers',
  WARRANTY_CLAIM: 'warranty_claims',
};

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function mapItem(r: Row): SupportItemRow {
  return {
    id: Number(r.id),
    kind: r.kind as SupportItemKind,
    channel: r.provider as SupportChannel,
    externalTicketId: (r.external_ticket_id as string | null) ?? null,
    subject: (r.subject_cache as string | null) ?? null,
    purpose: r.purpose as SupportPurpose,
    purposeSource: r.purpose_source as SupportPurposeSource,
    purposeAcknowledgedAt: iso(r.purpose_acknowledged_at),
    lifecycle: r.lifecycle as SupportLifecycle,
    snoozedUntil: iso(r.snoozed_until),
    requesterEmail: (r.requester_email as string | null) ?? null,
    accountLabel: (r.account_label as string | null) ?? null,
    primaryTaskId: numOrNull(r.primary_task_id),
    pendingInboundCount: Number(r.pending_inbound_count ?? 0),
    resolvedAt: iso(r.resolved_at),
  };
}

function mapMessage(r: Row): StoredSupportMessage {
  return {
    id: Number(r.id),
    supportItemId: Number(r.support_item_id),
    threadId: Number(r.thread_id),
    direction: (r.direction as SupportMessageDirection | null) ?? null,
    provider: r.provider as SupportMessageProvider,
    occurredAt: iso(r.occurred_at) ?? new Date(0).toISOString(),
    body: String(r.body ?? ''),
    authorStaffId: numOrNull(r.author_staff_id),
    replyDisposition: (r.reply_disposition as ReplyDisposition | null) ?? null,
    deliveryState: (r.delivery_state as DeliveryState | null) ?? null,
    externalMessageId: (r.external_message_id as string | null) ?? null,
    clientEventId: (r.client_event_id as string | null) ?? null,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  };
}

/** The Zendesk ticket number ticket_links still keys on, for a Zendesk-bound item. */
const ZENDESK_TICKET_SQL = `CASE WHEN st.provider = 'zendesk' AND st.external_ticket_id ~ '^[0-9]{1,18}$'
  THEN st.external_ticket_id::bigint END`;

export function pgSupportStore(client: PoolClient, orgId: OrgId): SupportStore {
  const q = (text: string, params: unknown[]) => client.query(text, params);

  const selectMessage = async (where: string, params: unknown[]): Promise<StoredSupportMessage | null> => {
    const res = await q(
      `SELECT ${MESSAGE_COLS}
         FROM thread_messages m
         JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
        WHERE m.organization_id = $1::uuid AND t.entity_type = 'SUPPORT_TICKET' AND ${where}
        LIMIT 1`,
      [orgId, ...params],
    );
    return res.rows[0] ? mapMessage(res.rows[0]) : null;
  };

  const readTask = async (taskId: number): Promise<SupportTaskRow | null> => {
    const res = await q(
      `SELECT wa.id, wa.status::text AS status, wa.task_state, wa.next_follow_up_at,
              ARRAY(
                SELECT o.staff_id FROM (
                  SELECT wa.assignee_staff_id AS staff_id, 0 AS rank WHERE wa.assignee_staff_id IS NOT NULL
                  UNION
                  SELECT a.staff_id, 1 FROM work_assignment_assignees a
                   WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
                ) o
                GROUP BY o.staff_id
                ORDER BY MIN(o.rank), o.staff_id
              ) AS owner_ids
         FROM work_assignments wa
        WHERE wa.organization_id = $1::uuid AND wa.id = $2 AND wa.work_type::text = $3`,
      [orgId, taskId, TASK_WORK_TYPE],
    );
    const r = res.rows[0];
    if (!r || !isTaskDeskStatus(r.status)) return null;
    return {
      id: Number(r.id),
      status: r.status,
      taskState: parseTaskHold(r.task_state),
      ownerIds: ((r.owner_ids as unknown[] | null) ?? []).map(Number),
      nextFollowUpAt: iso(r.next_follow_up_at),
    };
  };

  return {
    orgId,

    findMessageByClientEvent: (clientEventId) => selectMessage('m.client_event_id = $2', [clientEventId]),
    findMessageByExternal: (provider, externalMessageId) =>
      selectMessage('m.provider = $2 AND m.external_message_id = $3', [provider, externalMessageId]),
    async findMessage(supportItemId, messageId, opts) {
      const res = await q(
        `SELECT ${MESSAGE_COLS}
           FROM thread_messages m
           JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
          WHERE m.organization_id = $1::uuid AND m.id = $2 AND m.deleted_at IS NULL
            AND t.entity_type = 'SUPPORT_TICKET' AND t.entity_id = $3
          ${opts?.lock ? 'FOR UPDATE OF m' : ''}`,
        [orgId, messageId, supportItemId],
      );
      return res.rows[0] ? mapMessage(res.rows[0]) : null;
    },

    async lockItem(supportItemId) {
      const res = await q(
        `SELECT ${ITEM_COLS} FROM support_tickets WHERE organization_id = $1::uuid AND id = $2 FOR UPDATE`,
        [orgId, supportItemId],
      );
      return res.rows[0] ? mapItem(res.rows[0]) : null;
    },

    async lockItemByExternal(channel, externalTicketId) {
      const res = await q(
        `SELECT ${ITEM_COLS} FROM support_tickets
          WHERE organization_id = $1::uuid AND provider = $2 AND external_ticket_id = $3
          FOR UPDATE`,
        [orgId, channel, externalTicketId],
      );
      return res.rows[0] ? mapItem(res.rows[0]) : null;
    },

    async insertItem(a) {
      const res = await q(
        `INSERT INTO support_tickets
           (organization_id, provider, external_ticket_id, subject_cache, kind, purpose, purpose_source,
            purpose_acknowledged_by_staff_id, purpose_acknowledged_at, requester_name, requester_email,
            requester_handle, account_label, platform_id, platform_account_id, created_by, lifecycle, lifecycle_changed_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8,
                 CASE WHEN $6 <> 'unclassified' THEN now() END,
                 $9, $10, $11, $12, $13, $14, $15, 'open', now())
         ON CONFLICT (organization_id, provider, external_ticket_id) WHERE external_ticket_id IS NOT NULL
           DO NOTHING
         RETURNING ${ITEM_COLS}`,
        [
          orgId, a.channel, a.externalTicketId, a.subject, a.kind, a.purpose, a.purposeSource,
          a.purposeAcknowledgedByStaffId, a.requesterName, a.requesterEmail, a.requesterHandle,
          a.accountLabel, a.platformId, a.platformAccountId, a.createdByStaffId,
        ],
      );
      return res.rows[0] ? mapItem(res.rows[0]) : null;
    },

    async patchItem(supportItemId, p) {
      const params: unknown[] = [orgId, supportItemId];
      const push = (v: unknown) => {
        params.push(v);
        return `$${params.length}`;
      };
      const set: string[] = [];
      if (p.purpose !== undefined) set.push(`purpose = ${push(p.purpose)}`);
      if (p.purposeSource !== undefined) set.push(`purpose_source = ${push(p.purposeSource)}`);
      if (p.purposeAcknowledgedByStaffId !== undefined) {
        set.push(`purpose_acknowledged_by_staff_id = ${push(p.purposeAcknowledgedByStaffId)}`, 'purpose_acknowledged_at = now()');
      }
      if (p.lifecycle !== undefined) {
        const v = push(p.lifecycle);
        set.push(
          `lifecycle_changed_at = CASE WHEN lifecycle IS DISTINCT FROM ${v} THEN now() ELSE lifecycle_changed_at END`,
          `lifecycle = ${v}`,
        );
      }
      if (p.snoozedUntil !== undefined) set.push(`snoozed_until = ${push(p.snoozedUntil)}::timestamptz`);
      if (p.primaryTaskId !== undefined) set.push(`primary_task_id = ${push(p.primaryTaskId)}`);
      if (p.lastInboundAt !== undefined) {
        const v = push(p.lastInboundAt);
        set.push(`last_inbound_at = GREATEST(COALESCE(last_inbound_at, ${v}::timestamptz), ${v}::timestamptz)`);
      }
      if (p.lastOutboundAt !== undefined) {
        const v = push(p.lastOutboundAt);
        set.push(`last_outbound_at = GREATEST(COALESCE(last_outbound_at, ${v}::timestamptz), ${v}::timestamptz)`);
      }
      if (p.resolution === null) {
        set.push('resolved_at = NULL', 'resolved_by_staff_id = NULL', 'resolution_reason = NULL', 'resolution_override = false');
      } else if (p.resolution !== undefined) {
        set.push(
          'resolved_at = now()',
          `resolved_by_staff_id = ${push(p.resolution.byStaffId)}`,
          `resolution_reason = ${push(p.resolution.reason)}`,
          `resolution_override = ${push(p.resolution.override)}`,
        );
      }
      const f = p.fill;
      if (f) {
        if (f.subject) set.push(`subject_cache = COALESCE(subject_cache, ${push(f.subject)})`);
        if (f.requesterName) set.push(`requester_name = COALESCE(requester_name, ${push(f.requesterName)})`);
        if (f.requesterEmail) set.push(`requester_email = COALESCE(requester_email, ${push(f.requesterEmail)})`);
        if (f.requesterHandle) set.push(`requester_handle = COALESCE(requester_handle, ${push(f.requesterHandle)})`);
        if (f.accountLabel) set.push(`account_label = COALESCE(account_label, ${push(f.accountLabel)})`);
        if (f.platformId != null) set.push(`platform_id = COALESCE(platform_id, ${push(f.platformId)})`);
        if (f.platformAccountId != null) {
          set.push(`platform_account_id = COALESCE(platform_account_id, ${push(f.platformAccountId)})`);
        }
      }
      if (set.length === 0) return;
      await q(
        `UPDATE support_tickets SET ${set.join(', ')}, updated_at = now()
          WHERE organization_id = $1::uuid AND id = $2`,
        params,
      );
    },

    async ensureThread(supportItemId, createdByStaffId) {
      const res = await q(
        `INSERT INTO entity_threads (organization_id, entity_type, entity_id, support_ticket_id, created_by)
         VALUES ($1::uuid, 'SUPPORT_TICKET', $2::bigint, $2::bigint, $3)
         ON CONFLICT (organization_id, entity_type, entity_id)
           DO UPDATE SET deleted_at = NULL, support_ticket_id = EXCLUDED.support_ticket_id
         RETURNING id`,
        [orgId, supportItemId, createdByStaffId],
      );
      return Number(res.rows[0].id);
    },

    async insertMessage(a) {
      const res = await q(
        `WITH m AS (
           INSERT INTO thread_messages
             (organization_id, thread_id, author_staff_id, provider, visibility, body, client_event_id, meta,
              direction, external_message_id, occurred_at, author_label, reply_disposition,
              delivery_state, delivery_error)
           VALUES ($1::uuid, $2::bigint, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::timestamptz, $12, $13, $14, $15)
           ON CONFLICT DO NOTHING
           RETURNING *
         )
         SELECT ${MESSAGE_COLS} FROM m JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id`,
        [
          orgId, a.threadId, a.authorStaffId, a.provider, a.visibility, a.body, a.clientEventId,
          JSON.stringify(a.meta), a.direction, a.externalMessageId, a.occurredAt, a.authorLabel,
          a.replyDisposition, a.deliveryState, a.deliveryError,
        ],
      );
      const row = res.rows[0];
      if (!row) return null;
      const message = mapMessage(row);
      await q(
        `UPDATE entity_threads
            SET last_message_at = GREATEST(COALESCE(last_message_at, $3::timestamptz), $3::timestamptz),
                updated_at = now()
          WHERE organization_id = $1::uuid AND id = $2`,
        [orgId, a.threadId, message.occurredAt],
      );
      // Same-transaction spine row, as postThreadMessage writes it.
      await q(
        `INSERT INTO ops_events (organization_id, occurred_at, event_type, entity_type, entity_id,
                                 actor_staff_id, client_event_id, payload)
         VALUES ($1::uuid, $2::timestamptz, 'THREAD_MESSAGE', 'other', $3::bigint, $4, $5, $6::jsonb)
         ON CONFLICT (client_event_id) DO NOTHING`,
        [
          orgId, message.occurredAt, message.supportItemId, a.authorStaffId, `thread-message:${message.id}`,
          JSON.stringify({
            threadId: a.threadId,
            messageId: message.id,
            supportItemId: message.supportItemId,
            provider: a.provider,
            visibility: a.visibility,
            direction: a.direction,
            preview: a.body.trim().slice(0, 140),
          }),
        ],
      );
      return message;
    },

    async adoptOutbound(messageId, a) {
      const res = await q(
        `WITH m AS (
           UPDATE thread_messages
              SET author_staff_id = COALESCE(author_staff_id, $3),
                  client_event_id = COALESCE(client_event_id, $4),
                  delivery_state = $5,
                  delivery_error = NULL,
                  meta = COALESCE(meta, '{}'::jsonb) || $6::jsonb
            WHERE organization_id = $1::uuid AND id = $2 AND direction = 'outbound'
            RETURNING *
         )
         SELECT ${MESSAGE_COLS} FROM m JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id`,
        [orgId, messageId, a.authorStaffId, a.clientEventId, a.deliveryState, JSON.stringify(a.meta)],
      );
      if (!res.rows[0]) throw new Error(`thread_messages ${messageId} is not an outbound message`);
      return mapMessage(res.rows[0]);
    },

    async setDelivery(messageId, deliveryState, deliveryError) {
      await q(
        `UPDATE thread_messages SET delivery_state = $3, delivery_error = $4
          WHERE organization_id = $1::uuid AND id = $2 AND direction = 'outbound'`,
        [orgId, messageId, deliveryState, deliveryError],
      );
    },

    async listPendingInbound(supportItemId) {
      const res = await q(
        `SELECT m.id, COALESCE(m.occurred_at, m.created_at) AS occurred_at
           FROM thread_messages m
           JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
          WHERE m.organization_id = $1::uuid AND t.entity_type = 'SUPPORT_TICKET' AND t.entity_id = $2
            AND m.reply_disposition = 'pending' AND m.deleted_at IS NULL
          ORDER BY COALESCE(m.occurred_at, m.created_at), m.id`,
        [orgId, supportItemId],
      );
      return res.rows.map((r) => ({ id: Number(r.id), occurredAt: iso(r.occurred_at) ?? new Date(0).toISOString() }));
    },

    async markAnswered(messageIds, answeredByMessageId) {
      if (messageIds.length === 0) return;
      await q(
        `UPDATE thread_messages
            SET reply_disposition = 'answered', answered_by_message_id = $3
          WHERE organization_id = $1::uuid AND id = ANY($2::bigint[]) AND reply_disposition = 'pending'`,
        [orgId, messageIds, answeredByMessageId],
      );
    },

    async markNoReplyRequired(messageId, staffId, reason) {
      await q(
        `UPDATE thread_messages
            SET reply_disposition = 'no_reply_required', disposition_by_staff_id = $3,
                disposition_at = now(), disposition_reason = $4
          WHERE organization_id = $1::uuid AND id = $2 AND reply_disposition = 'pending'`,
        [orgId, messageId, staffId, reason],
      );
    },

    async recountPending(supportItemId) {
      const res = await q(
        `UPDATE support_tickets st
            SET pending_inbound_count = (
                  SELECT count(*)::int
                    FROM thread_messages m
                    JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
                   WHERE m.organization_id = st.organization_id AND t.entity_type = 'SUPPORT_TICKET'
                     AND t.entity_id = st.id AND m.reply_disposition = 'pending' AND m.deleted_at IS NULL),
                updated_at = now()
          WHERE st.organization_id = $1::uuid AND st.id = $2
          RETURNING st.pending_inbound_count`,
        [orgId, supportItemId],
      );
      return Number(res.rows[0]?.pending_inbound_count ?? 0);
    },

    async deliveryCounts(supportItemId) {
      const res = await q(
        `SELECT count(*) FILTER (WHERE m.delivery_state IN ('pending','copied'))::int AS open,
                count(*) FILTER (WHERE m.delivery_state = 'failed')::int AS failed
           FROM thread_messages m
           JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
          WHERE m.organization_id = $1::uuid AND t.entity_type = 'SUPPORT_TICKET' AND t.entity_id = $2
            AND m.direction = 'outbound' AND m.deleted_at IS NULL`,
        [orgId, supportItemId],
      );
      return { open: Number(res.rows[0]?.open ?? 0), failed: Number(res.rows[0]?.failed ?? 0) };
    },

    readTask,

    async insertTask(a) {
      if (a.assigneeStaffIds.length > 0) {
        const staff = await q(
          `SELECT id FROM staff WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
          [orgId, a.assigneeStaffIds],
        );
        if (staff.rowCount !== a.assigneeStaffIds.length) return null;
      }
      // The create-task row (createTaskDeps.insertTask), on this transaction.
      const res = await q(
        `INSERT INTO work_assignments
           (organization_id, entity_type, entity_id, work_type, assignee_staff_id, assigned_by_staff_id,
            status, priority, notes, deadline_at)
         VALUES ($1::uuid, $2::work_entity_type_enum, $3, $4::work_type_enum, $5, $6,
                 $7::assignment_status_enum, $8, $9, $10::timestamptz)
         RETURNING id`,
        [
          orgId, taskEntityEnum('support_ticket'), a.supportItemId, TASK_WORK_TYPE, a.assigneeStaffIds[0] ?? null,
          a.assignedByStaffId, TASK_INITIAL_STATUS, a.priority, a.note, a.deadlineAt,
        ],
      );
      const taskId = Number(res.rows[0].id);
      if (a.assigneeStaffIds.length > 0) {
        await q(
          `INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
           SELECT $1::uuid, $2, unnest($3::int[])`,
          [orgId, taskId, a.assigneeStaffIds],
        );
      }
      return readTask(taskId);
    },

    async addTaskOwners(taskId, staffIds) {
      if (staffIds.length === 0) return [];
      const res = await q(
        `INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
         SELECT $1::uuid, $2, s.id FROM staff s WHERE s.organization_id = $1::uuid AND s.id = ANY($3::int[])
         ON CONFLICT (organization_id, assignment_id, staff_id) DO NOTHING
         RETURNING staff_id`,
        [orgId, taskId, staffIds],
      );
      const added = res.rows.map((r) => Number(r.staff_id));
      if (added.length > 0) {
        await q(
          `UPDATE work_assignments SET assignee_staff_id = $3, updated_at = now()
            WHERE organization_id = $1::uuid AND id = $2 AND assignee_staff_id IS NULL`,
          [orgId, taskId, added[0]],
        );
      }
      return added;
    },

    async patchTask(taskId, patch, actorStaffId) {
      const result = await patchTaskDeskRowInTx(orgId, taskId, patch, {
        query: async (sql, params) => {
          const r = await client.query(sql, params);
          return { rows: r.rows, rowCount: r.rowCount };
        },
      });
      if (!result.ok) throw new Error(`support task ${taskId} patch refused: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`);
      // The task desk's own audit row — the Timeline paints it as "Moved to …".
      await recordAudit(client, null, null, {
        source: 'support-loop',
        action: AUDIT_ACTION.WORK_TASK_UPDATE,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: taskId,
        actorStaffIdOverride: actorStaffId,
        organizationIdOverride: orgId,
        method: 'system',
        before: {
          status: result.before.status,
          taskState: result.before.taskState,
          assigneeStaffId: result.before.assigneeStaffId,
          assigneeStaffIds: result.before.assigneeStaffIds,
          projectName: result.before.projectName,
        },
        after: {
          status: result.task.status,
          taskState: result.task.taskState,
          assigneeStaffId: result.task.assignee?.id ?? null,
          assigneeStaffIds: result.task.assignees.map(({ id }) => id),
          projectName: result.task.projectName,
          nextFollowUpAt: result.task.nextFollowUpAt,
          completedAt: result.task.completedAt,
        },
        extra: { changed: result.changed },
      });
      return readTask(taskId);
    },

    async logFollowUp(a) {
      const followUp = await logTaskFollowUpInTx(client, orgId, a.staffId, a.taskId, {
        channel: a.channel,
        direction: a.direction,
        occurredAt: a.occurredAt,
        body: a.body,
        nextFollowUpAt: undefined,
        threadMessageId: a.threadMessageId,
        stampLastFollowUp: a.stampLastFollowUp,
      });
      return followUp?.id ?? null;
    },

    async linkOrders(supportItemId, links, staffId) {
      await linkSupportItemOrders(client, { orgId, supportItemId, links, staffId });
    },

    async linkEntities(supportItemId, links, staffId) {
      for (const link of links) {
        const parent = ENTITY_PARENT[link.entityType];
        const exists = await q(`SELECT 1 FROM ${parent} WHERE organization_id = $1::uuid AND id = $2`, [orgId, link.entityId]);
        if (exists.rowCount === 0) throw new SupportInputError(404, `${link.entityType} ${link.entityId} not found`);
        await q(
          `INSERT INTO ticket_links
             (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id, is_primary, link_role, created_by)
           SELECT $1::uuid, st.id, ${ZENDESK_TICKET_SQL}, $3, $4, false, 'reference', $5
             FROM support_tickets st
            WHERE st.organization_id = $1::uuid AND st.id = $2
           ON CONFLICT DO NOTHING`,
          [orgId, supportItemId, link.entityType, link.entityId, staffId],
        );
      }
    },

    async linkPhotos(supportItemId, photoIds) {
      if (photoIds.length === 0) return [];
      const res = await q(`SELECT id FROM photos WHERE organization_id = $1::uuid AND id = ANY($2::bigint[])`, [orgId, photoIds]);
      const kept = res.rows.map((r) => Number(r.id));
      if (kept.length > 0) {
        await q(
          `INSERT INTO photo_entity_links (organization_id, photo_id, entity_type, entity_id, link_role)
           SELECT $1::uuid, unnest($2::bigint[]), 'ZENDESK_TICKET', $3, 'claim_evidence'
           ON CONFLICT DO NOTHING`,
          [orgId, kept, supportItemId],
        );
      }
      return kept;
    },

    staleDrafts: (supportItemId, reason, kind) => staleSupportDrafts(client, { orgId, supportItemId, reason, kind }),
    enqueueDraft: (supportItemId, kind, sourceMessageId, requestedByStaffId) =>
      enqueueSupportDraft(client, { orgId, supportItemId, kind, sourceMessageId, requestedByStaffId }),
    markDraftUsed: (draftId, messageId) => markSupportDraftUsed(client, { orgId, draftId, messageId }),

    async refreshCheckIn(supportItemId, staffId, nowMs) {
      await refreshOrderCheckInForItem(client, { orgId, supportItemId, staffId, nowMs });
    },
    async closeCheckIn(supportItemId, a) {
      await closeOrderCheckInForItem(client, { orgId, supportItemId, ...a });
    },

    async recordEvent(e) {
      await recordAudit(client, null, null, {
        source: 'support-loop',
        action: e.action,
        entityType: AUDIT_ENTITY.WORK_ASSIGNMENT,
        entityId: e.taskId,
        actorStaffIdOverride: e.actorStaffId,
        organizationIdOverride: orgId,
        method: 'system',
        before: e.before ?? null,
        after: e.after,
        extra: e.extra,
        reasonCode: e.reasonCode ?? null,
      });
    },
  };
}

/** The production {@link SupportTransaction}. */
export const supportTransaction: SupportTransaction = (orgId, fn) =>
  withTenantTransaction(orgId, (client) => fn(pgSupportStore(client, orgId)));
