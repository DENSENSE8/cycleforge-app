import 'server-only';

/**
 * `readSupportItemBundle` — everything the Support record shows, read from
 * the LOCAL store only (zero provider calls): the item, its primary task, the
 * thread, drafts, exact orders, the check-in projection and the transport.
 */
import { readOrderCheckInViewForItem } from '@/lib/support/check-ins/projection';
import { listSupportDraftViews } from '@/lib/support/drafts/store';
import { readSupportOrderRefs } from '@/lib/support/orders/order-facts';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

import {
  supportResolveBlockers,
  supportWorkFlags,
  type DeliveryState,
  type ReplyDisposition,
  type SupportChannel,
  type SupportItemBundle,
  type SupportItemKind,
  type SupportLifecycle,
  type SupportMessageDirection,
  type SupportMessageProvider,
  type SupportMessageView,
  type SupportPurpose,
  type SupportPurposeSource,
  type SupportStaffRef,
} from './model';
import { isHelpdeskConnected, resolveSupportTransport } from './transport';

type Row = Record<string, unknown>;

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function staffRef(id: unknown, name: unknown): SupportStaffRef | null {
  return id == null ? null : { id: Number(id), name: text(name) ?? `Staff #${Number(id)}` };
}

function photoIdsOf(meta: unknown): number[] {
  const raw = (meta as { photoIds?: unknown } | null)?.photoIds;
  return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0) : [];
}

function mapMessage(r: Row): SupportMessageView {
  const disposition = r.reply_disposition as ReplyDisposition | null;
  return {
    id: Number(r.id),
    direction: ((r.direction as SupportMessageDirection | null) ?? (r.visibility === 'internal' ? 'internal' : 'inbound')),
    visibility: r.visibility === 'public' ? 'public' : 'internal',
    provider: r.provider as SupportMessageProvider,
    body: String(r.body ?? ''),
    occurredAt: iso(r.occurred_at) ?? iso(r.created_at) ?? new Date(0).toISOString(),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    author: { staff: staffRef(r.author_staff_id, r.author_name), label: text(r.author_label) },
    replyDisposition: disposition,
    answeredByMessageId: r.answered_by_message_id == null ? null : Number(r.answered_by_message_id),
    disposition:
      disposition === 'no_reply_required'
        ? {
            by: staffRef(r.disposition_by_staff_id, r.disposition_by_name),
            at: iso(r.disposition_at),
            reason: text(r.disposition_reason),
          }
        : null,
    deliveryState: (r.delivery_state as DeliveryState | null) ?? null,
    deliveryError: text(r.delivery_error),
    externalMessageId: text(r.external_message_id),
    photoIds: photoIdsOf(r.meta),
  };
}

/** The item + primary task + owners ($1 org, $2 item). Exported for the rollback smoke. */
export const SUPPORT_BUNDLE_ITEM_SQL = `SELECT st.*, ack.name AS ack_name, res.name AS resolved_by_name,
            pl.label AS platform_label,
            wa.id AS task_id, wa.status::text AS task_status, wa.task_state, wa.next_follow_up_at,
            wa.last_follow_up_at, wa.deadline_at,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('id', o.staff_id, 'name', s.name) ORDER BY o.rank, o.staff_id)
                FROM (
                  SELECT wa.assignee_staff_id AS staff_id, 0 AS rank WHERE wa.assignee_staff_id IS NOT NULL
                  UNION
                  SELECT a.staff_id, 1 FROM work_assignment_assignees a
                   WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
                     AND a.staff_id IS DISTINCT FROM wa.assignee_staff_id
                ) o
                LEFT JOIN staff s ON s.organization_id = wa.organization_id AND s.id = o.staff_id
            ), '[]'::jsonb) AS task_assignees
       FROM support_tickets st
       LEFT JOIN staff ack ON ack.organization_id = st.organization_id AND ack.id = st.purpose_acknowledged_by_staff_id
       LEFT JOIN staff res ON res.organization_id = st.organization_id AND res.id = st.resolved_by_staff_id
       LEFT JOIN work_assignments wa ON wa.organization_id = st.organization_id AND wa.id = st.primary_task_id
       LEFT JOIN platforms pl ON pl.organization_id = st.organization_id AND pl.id = st.platform_id
      WHERE st.organization_id = $1::uuid AND st.id = $2`;

/** The item's SUPPORT_TICKET thread, oldest first ($1 org, $2 item). */
export const SUPPORT_BUNDLE_MESSAGES_SQL = `SELECT m.id, m.direction, m.visibility, m.provider, m.body, m.occurred_at, m.created_at,
              m.author_staff_id, au.name AS author_name, m.author_label, m.reply_disposition,
              m.answered_by_message_id, m.disposition_by_staff_id, ds.name AS disposition_by_name,
              m.disposition_at, m.disposition_reason, m.delivery_state, m.delivery_error,
              m.external_message_id, m.meta
         FROM thread_messages m
         JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
         LEFT JOIN staff au ON au.organization_id = m.organization_id AND au.id = m.author_staff_id
         LEFT JOIN staff ds ON ds.organization_id = m.organization_id AND ds.id = m.disposition_by_staff_id
        WHERE m.organization_id = $1::uuid AND t.entity_type = 'SUPPORT_TICKET' AND t.entity_id = $2
          AND m.deleted_at IS NULL
        ORDER BY COALESCE(m.occurred_at, m.created_at), m.id`;

export async function readSupportItemBundle(
  orgId: OrgId,
  supportItemId: number,
  nowMs: number = Date.now(),
): Promise<SupportItemBundle | null> {
  if (!Number.isSafeInteger(supportItemId) || supportItemId <= 0) return null;
  const itemRes = await tenantQuery(orgId, SUPPORT_BUNDLE_ITEM_SQL, [orgId, supportItemId]);
  const r = itemRes.rows[0] as Row | undefined;
  if (!r) return null;

  const channel = r.provider as SupportChannel;
  const [messagesRes, drafts, orders, checkIn, helpdeskConfigured] = await Promise.all([
    tenantQuery(orgId, SUPPORT_BUNDLE_MESSAGES_SQL, [orgId, supportItemId]),
    listSupportDraftViews(orgId, supportItemId),
    readSupportOrderRefs(orgId, supportItemId),
    readOrderCheckInViewForItem(orgId, supportItemId),
    channel === 'zendesk' ? isHelpdeskConnected(orgId) : Promise.resolve(false),
  ]);

  const messages = messagesRes.rows.map((m) => mapMessage(m as Row));
  const primaryOrder = orders.find((o) => o.primary) ?? null;
  const purpose = r.purpose as SupportPurpose;
  const lifecycle = r.lifecycle as SupportLifecycle;
  const pendingInboundCount = Number(r.pending_inbound_count ?? 0);
  const nextFollowUpAt = iso(r.next_follow_up_at);
  const nextFollowUpAtMs = nextFollowUpAt ? Date.parse(nextFollowUpAt) : null;
  const assignees = ((r.task_assignees as Array<{ id: number; name: string | null }> | null) ?? []).map((a) => ({
    id: Number(a.id),
    name: a.name ?? `Staff #${Number(a.id)}`,
  }));
  const syncState = (r.sync_state as 'ok' | 'failed' | null) ?? null;
  const purposeAcknowledgedAt = iso(r.purpose_acknowledged_at);
  const resolvedAt = iso(r.resolved_at);

  return {
    item: {
      id: Number(r.id),
      kind: r.kind as SupportItemKind,
      channel,
      externalTicketId: text(r.external_ticket_id),
      subject: text(r.subject_cache),
      purpose,
      purposeSource: r.purpose_source as SupportPurposeSource,
      purposeSuggestion: (r.purpose_suggestion as 'customer_conversation' | 'internal_record' | null) ?? null,
      purposeSuggestionReason: text(r.purpose_suggestion_reason),
      purposeAcknowledgedBy: staffRef(r.purpose_acknowledged_by_staff_id, r.ack_name),
      purposeAcknowledgedAt,
      lifecycle,
      snoozedUntil: iso(r.snoozed_until),
      requester: { name: text(r.requester_name), email: text(r.requester_email), handle: text(r.requester_handle) },
      accountLabel: text(r.account_label),
      platformAccountId: r.platform_account_id == null ? null : Number(r.platform_account_id),
      platform:
        r.platform_id == null || r.platform_label == null
          ? null
          : { id: Number(r.platform_id), label: String(r.platform_label) },
      primaryOrder,
      orders,
      task:
        r.task_id == null
          ? null
          : {
              id: Number(r.task_id),
              status: String(r.task_status),
              taskState: text(r.task_state),
              assignees,
              nextFollowUpAt,
              lastFollowUpAt: iso(r.last_follow_up_at),
              deadlineAt: iso(r.deadline_at),
            },
      flags: supportWorkFlags(
        {
          purpose,
          lifecycle,
          pendingInboundCount,
          draftReady: drafts.some((dr) => dr.status === 'ready'),
          nextFollowUpAtMs,
          assigneeCount: assignees.length,
          syncState,
        },
        nowMs,
      ),
      pendingInboundCount,
      lastInboundAt: iso(r.last_inbound_at),
      lastOutboundAt: iso(r.last_outbound_at),
      sync: { state: syncState, error: text(r.sync_error), failedAt: iso(r.sync_failed_at) },
      transport: resolveSupportTransport({
        channel,
        externalTicketId: text(r.external_ticket_id),
        requesterEmail: text(r.requester_email),
        orderNumber: primaryOrder?.orderNumber ?? null,
        subject: text(r.subject_cache),
        helpdeskConfigured,
      }),
      resolution:
        lifecycle === 'resolved' && resolvedAt
          ? {
              resolvedAt,
              resolvedBy: staffRef(r.resolved_by_staff_id, r.resolved_by_name),
              reason: text(r.resolution_reason),
              override: r.resolution_override === true,
            }
          : null,
      resolveBlockers:
        lifecycle === 'resolved'
          ? []
          : supportResolveBlockers(
              {
                purpose,
                purposeAcknowledgedAt,
                pendingInboundCount,
                nextFollowUpAtMs,
                openDeliveryCount: messages.filter((m) => m.deliveryState === 'pending' || m.deliveryState === 'copied').length,
                failedDeliveryCount: messages.filter((m) => m.deliveryState === 'failed').length,
              },
              nowMs,
            ),
      checkIn,
      createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    },
    messages,
    drafts,
  };
}

/** True when a Zendesk-bound item has mirrored comments but no thread messages yet (GET lazily backfills). */
export async function supportItemNeedsMirrorBackfill(orgId: OrgId, supportItemId: number): Promise<boolean> {
  const res = await tenantQuery<{ needs: boolean }>(
    orgId,
    `SELECT (st.provider = 'zendesk'
             AND EXISTS (SELECT 1 FROM support_ticket_comments c
                          WHERE c.organization_id = st.organization_id AND c.support_ticket_id = st.id)
             AND NOT EXISTS (SELECT 1 FROM thread_messages m
                               JOIN entity_threads t ON t.id = m.thread_id AND t.organization_id = m.organization_id
                              WHERE m.organization_id = st.organization_id AND t.entity_type = 'SUPPORT_TICKET'
                                AND t.entity_id = st.id)) AS needs
       FROM support_tickets st
      WHERE st.organization_id = $1::uuid AND st.id = $2`,
    [orgId, supportItemId],
  );
  return res.rows[0]?.needs === true;
}

/** The two facts a write route needs before ingesting: the item's transport and its primary task. */
export async function readSupportItemHead(
  orgId: OrgId,
  supportItemId: number,
): Promise<{ channel: SupportChannel; primaryTaskId: number | null } | null> {
  const res = await tenantQuery<{ provider: string; primary_task_id: number | string | null }>(
    orgId,
    `SELECT provider, primary_task_id FROM support_tickets WHERE organization_id = $1::uuid AND id = $2`,
    [orgId, supportItemId],
  );
  const r = res.rows[0];
  return r ? { channel: r.provider as SupportChannel, primaryTaskId: r.primary_task_id == null ? null : Number(r.primary_task_id) } : null;
}
