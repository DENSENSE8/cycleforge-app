import 'server-only';

/**
 * `listSupportRows` — every Support item of the org as a {@link SupportListRow},
 * read in ONE tenant-scoped statement from local tables only (zero provider
 * calls). Statuses and flags are stamped against the caller's clock; the view,
 * status, facet and sort cut happens in `cutSupportList` (support-list.ts).
 */

import { supportContactFace } from '@/lib/support/contact-face';
import {
  ORDER_CHECK_IN_STATES,
  SUPPORT_CHANNELS,
  SUPPORT_ITEM_KINDS,
  SUPPORT_LIFECYCLES,
  SUPPORT_PURPOSES,
  supportLocalStatus,
  supportWorkFlags,
} from '@/lib/support/conversation/model';
import { taskUrgencyFromPriority } from '@/lib/tasks/task-vocabulary';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

import type { SupportListRow } from './support-list';

type Row = Record<string, unknown>;

/** Tenant-scoped query seam (tests bind a fake; production binds `tenantQuery`). */
export interface SupportListDeps {
  query: (orgId: OrgId, sql: string, params: unknown[]) => Promise<{ rows: Row[] }>;
}

const supportListDbDeps: SupportListDeps = { query: tenantQuery };

/** The find text as the statement binds it: `$2` the ILIKE pattern, `$3` an exact local id. */
export interface SupportListSearchTerms {
  pattern: string;
  exactId: number | null;
}

/** Free text → bind values; a leading `#` / `T-` is dropped. Null when there is nothing to find. */
export function supportListSearchTerms(raw: string | null | undefined): SupportListSearchTerms | null {
  const bare = (raw ?? '').trim().replace(/^(#|t-)\s*/i, '').trim();
  if (!bare) return null;
  const exactId = /^\d{1,15}$/.test(bare) && Number(bare) > 0 && Number.isSafeInteger(Number(bare)) ? Number(bare) : null;
  return { pattern: `%${bare}%`, exactId };
}

/**
 * ONE statement ($1 org, $2 find pattern or NULL, $3 exact id or NULL).
 * Owners = the primary task's assignee + shared members (bundle.ts rule);
 * draft ready = any `ready` draft (bundle / Tasks rule); check-in = the latest
 * order_support_follow_ups row. Find covers subject, provider ticket id,
 * requester, account, platform, every exact order (primary + ORDER links:
 * local order #, marketplace item #, SKU, tracking, orders.id exact), other
 * links (pasted reference, shipment tracking, repair ticket number), and the
 * Support # / task id exactly.
 */
export const SUPPORT_LIST_SQL = `
  SELECT st.id,
         st.kind,
         st.purpose,
         st.lifecycle,
         st.provider,
         st.external_ticket_id,
         COALESCE(
           NULLIF(BTRIM(st.subject_cache), ''),
           (SELECT NULLIF(BTRIM(split_part(BTRIM(fm.body), E'\\n', 1)), '')
              FROM entity_threads ft
              JOIN thread_messages fm
                ON fm.organization_id = ft.organization_id
               AND fm.thread_id = ft.id
               AND fm.deleted_at IS NULL
             WHERE ft.organization_id = st.organization_id
               AND ft.entity_type = 'SUPPORT_TICKET'
               AND ft.entity_id = st.id
             ORDER BY fm.created_at, fm.id
             LIMIT 1))                AS subject,
         st.requester_name,
         st.requester_email,
         st.requester_handle,
         st.account_label,
         pa.id                        AS account_id,
         pa.label                     AS account_row_label,
         p.id                         AS platform_id,
         p.label                      AS platform_label,
         st.pending_inbound_count,
         st.last_inbound_at,
         st.last_outbound_at,
         GREATEST(st.created_at, st.last_inbound_at, st.last_outbound_at,
                  st.lifecycle_changed_at, st.resolved_at) AS last_activity_at,
         st.sync_state,
         st.resolved_at,
         st.created_at,
         wa.id                        AS task_id,
         wa.priority                  AS task_priority,
         wa.next_follow_up_at,
         wa.deadline_at,
         COALESCE(owners.assignees, '[]'::jsonb) AS assignees,
         EXISTS (
           SELECT 1 FROM support_drafts sd
            WHERE sd.organization_id = st.organization_id
              AND sd.support_ticket_id = st.id
              AND sd.status = 'ready') AS draft_ready,
         (SELECT ci.state FROM order_support_follow_ups ci
           WHERE ci.organization_id = st.organization_id
             AND ci.support_ticket_id = st.id
           ORDER BY ci.updated_at DESC, ci.id DESC
           LIMIT 1)                    AS check_in_state,
         po.id                        AS order_id,
         po.order_id                  AS order_number,
         po.account_source            AS order_platform
    FROM support_tickets st
    LEFT JOIN work_assignments wa
      ON wa.organization_id = st.organization_id
     AND wa.id = st.primary_task_id
    LEFT JOIN platforms p
      ON p.organization_id = st.organization_id
     AND p.id = st.platform_id
    LEFT JOIN platform_accounts pa
      ON pa.organization_id = st.organization_id
     AND pa.id = st.platform_account_id
    LEFT JOIN orders po
      ON po.organization_id = st.organization_id
     AND po.id = st.primary_order_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', o.staff_id, 'name', COALESCE(s.name, 'Staff #' || o.staff_id))
                       ORDER BY o.rank, o.staff_id) AS assignees
        FROM (
          SELECT wa.assignee_staff_id AS staff_id, 0 AS rank WHERE wa.assignee_staff_id IS NOT NULL
          UNION
          SELECT a.staff_id, 1 FROM work_assignment_assignees a
           WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
             AND a.staff_id IS DISTINCT FROM wa.assignee_staff_id
        ) o
        LEFT JOIN staff s ON s.organization_id = st.organization_id AND s.id = o.staff_id
    ) owners ON TRUE
   WHERE st.organization_id = $1::uuid
     AND ($2::text IS NULL
          OR ($3::bigint IS NOT NULL AND (st.id = $3 OR st.primary_task_id = $3))
          OR st.subject_cache ILIKE $2
          OR st.external_ticket_id ILIKE $2
          OR st.requester_email ILIKE $2
          OR st.requester_name ILIKE $2
          OR st.requester_handle ILIKE $2
          OR st.account_label ILIKE $2
          OR pa.label ILIKE $2
          OR p.label ILIKE $2
          OR p.short_label ILIKE $2
          OR EXISTS (
               SELECT 1
                 FROM orders qo
                 LEFT JOIN shipping_tracking_numbers qs
                   ON qs.organization_id = qo.organization_id
                  AND qs.id = qo.shipment_id
                WHERE qo.organization_id = st.organization_id
                  AND (qo.id = st.primary_order_id
                       OR qo.id IN (
                         SELECT ql.entity_id
                           FROM ticket_links ql
                          WHERE ql.organization_id = st.organization_id
                            AND ql.support_ticket_id = st.id
                            AND ql.entity_type = 'ORDER'))
                  AND (($3::bigint IS NOT NULL AND qo.id = $3)
                       OR qo.order_id ILIKE $2
                       OR qo.item_number ILIKE $2
                       OR qo.sku ILIKE $2
                       OR qs.tracking_number_raw ILIKE $2
                       OR qs.tracking_number_normalized ILIKE $2))
          OR EXISTS (
               SELECT 1
                 FROM ticket_links qt
                 LEFT JOIN shipping_tracking_numbers qts
                   ON qt.entity_type = 'SHIPMENT'
                  AND qts.organization_id = qt.organization_id
                  AND qts.id = qt.entity_id
                 LEFT JOIN repair_service qr
                   ON qt.entity_type = 'REPAIR'
                  AND qr.organization_id = qt.organization_id
                  AND qr.id = qt.entity_id
                WHERE qt.organization_id = st.organization_id
                  AND qt.support_ticket_id = st.id
                  AND (qt.external_reference ILIKE $2
                       OR qts.tracking_number_raw ILIKE $2
                       OR qts.tracking_number_normalized ILIKE $2
                       OR qr.ticket_number ILIKE $2)))
   ORDER BY st.id DESC`;

function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function oneOf<T extends string>(list: readonly T[], raw: unknown, fallback: T): T {
  return typeof raw === 'string' && (list as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function intOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** One SQL row → the list row, statuses and flags against `nowMs`. Exported for tests. */
export function mapSupportListRow(r: Row, nowMs: number): SupportListRow {
  const purpose = oneOf(SUPPORT_PURPOSES, r.purpose, 'unclassified');
  const lifecycle = oneOf(SUPPORT_LIFECYCLES, r.lifecycle, 'open');
  const pendingInboundCount = intOrNull(r.pending_inbound_count) ?? 0;
  const lastOutboundAt = iso(r.last_outbound_at);
  const resolvedAt = iso(r.resolved_at);
  const nextFollowUpAt = iso(r.next_follow_up_at);
  const assignees = ((r.assignees as Array<{ id: unknown; name: unknown }> | null) ?? []).map((a) => ({
    id: Number(a.id),
    name: text(a.name) ?? `Staff #${Number(a.id)}`,
  }));
  const sync = text(r.sync_state);
  const taskId = intOrNull(r.task_id);
  const platformId = intOrNull(r.platform_id);
  const accountRowLabel = text(r.account_row_label);
  const accountLabel = text(r.account_label);
  const orderId = intOrNull(r.order_id);
  const checkIn = text(r.check_in_state);
  const createdAt = iso(r.created_at) ?? new Date(0).toISOString();

  return {
    itemId: Number(r.id),
    taskId,
    kind: oneOf(SUPPORT_ITEM_KINDS, r.kind, 'conversation'),
    purpose,
    lifecycle,
    status: supportLocalStatus({ purpose, lifecycle, pendingInboundCount, lastOutboundAt, resolvedAt }, nowMs),
    flags: supportWorkFlags(
      {
        purpose,
        lifecycle,
        pendingInboundCount,
        draftReady: r.draft_ready === true,
        nextFollowUpAtMs: nextFollowUpAt ? Date.parse(nextFollowUpAt) : null,
        assigneeCount: assignees.length,
        syncState: sync === 'ok' || sync === 'failed' ? sync : null,
      },
      nowMs,
    ),
    subject: text(r.subject),
    transport: oneOf(SUPPORT_CHANNELS, r.provider, 'manual'),
    externalTicketId: text(r.external_ticket_id),
    platform: platformId == null ? null : { id: platformId, label: text(r.platform_label) ?? `Platform #${platformId}` },
    account: accountRowLabel
      ? { id: intOrNull(r.account_id), label: accountRowLabel }
      : accountLabel
        ? { id: null, label: accountLabel }
        : null,
    contact: supportContactFace({
      name: text(r.requester_name),
      email: text(r.requester_email),
      handle: text(r.requester_handle),
    }),
    primaryOrder:
      orderId == null
        ? null
        : { orderId, orderNumber: text(r.order_number), platformLabel: text(r.order_platform) },
    assignees,
    pendingInboundCount,
    lastInboundAt: iso(r.last_inbound_at),
    lastOutboundAt,
    lastActivityAt: iso(r.last_activity_at) ?? createdAt,
    nextFollowUpAt,
    deadlineAt: iso(r.deadline_at),
    urgent: taskId != null && taskUrgencyFromPriority(intOrNull(r.task_priority)) === 'urgent',
    resolvedAt,
    createdAt,
    checkInState:
      checkIn != null && (ORDER_CHECK_IN_STATES as readonly string[]).includes(checkIn)
        ? (checkIn as SupportListRow['checkInState'])
        : null,
  };
}

/** Every Support item of the org matching the find text `q` (all of them when blank). */
export async function listSupportRows(
  orgId: OrgId,
  opts: { q?: string | null; nowMs?: number },
  deps: SupportListDeps = supportListDbDeps,
): Promise<SupportListRow[]> {
  const nowMs = opts.nowMs ?? Date.now();
  const terms = supportListSearchTerms(opts.q);
  const res = await deps.query(orgId, SUPPORT_LIST_SQL, [orgId, terms?.pattern ?? null, terms?.exactId ?? null]);
  return res.rows.map((r) => mapSupportListRow(r, nowMs));
}
