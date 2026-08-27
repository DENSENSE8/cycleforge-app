import { tenantQuery } from '@/lib/tenancy/db';
import {
  orderPendingWork,
  type PendingWorkItem,
} from '@/lib/receiving/pending-work-model';
import { receivingExceptionLabel } from '@/lib/receiving/exception-codes';
import { listPendingNasArchives } from '@/lib/receiving/nas-archive-pending';
import { cartonReadHref } from '@/lib/receiving/surface-path';


/**
 * Follow-up work an operator owes on a carton they have already scanned away
 * from — one registry, one card.
 *
 * WHY A REGISTRY AND NOT A CARD PER FEATURE: every one of these is "a durable
 * fact went stale and the surface that carried it unmounted when the operator
 * scanned the next box". Given a corner each, two features are a pair of
 * competing cards and four are a notification wall on a focus-locked scan
 * bench. One card showing the most recent item and counting the rest keeps the
 * cost flat as sources are added — the same reasoning the house applies to the
 * right edge having exactly two grammars.
 *
 * A new source implements one function returning {@link PendingWorkItem}s and
 * is added to {@link SOURCES}. It must be scoped org + staff: the card follows
 * the operator, so it must only ever show work THEY did.
 */
interface OpenExceptionRow {
  receiving_id: number;
  order_ref: string | null;
  ticket_number: string | null;
  open_count: number;
  latest_at: string;
  codes: string[];
}

/**
 * How far back an open exception still counts as "follow-up you owe".
 *
 * This card's premise is work the operator walked away from minutes or hours
 * ago. An all-time backlog is a different product — dogfood carries 38 open
 * exceptions stretching back to mid-July, every one of them RETURN_NO_ORDER,
 * and putting those in a corner card would produce a nag that can never be
 * cleared from the corner and that buries the one exception raised on the
 * carton just scanned. Old ones are real work; they belong on a queue view
 * somebody triages deliberately, not on the bench.
 */
const EXCEPTION_RECENCY_DAYS = 7;

/**
 * Cartons carrying receiving exceptions this staffer opened and nobody closed,
 * within {@link EXCEPTION_RECENCY_DAYS}.
 *
 * Gated on `status = 'OPEN'` rather than `resolved_at IS NULL` because that is
 * the column the partial index covers. The two agree on every row in the
 * dogfood tenant today (checked: 38 / 38, zero disagreement), so this is an
 * index choice and not a semantic one — if they ever diverge, `resolved_at` is
 * the fact and `status` is the cache.
 */
async function listOpenReceivingExceptions(
  organizationId: string,
  staffId: number,
  opts: { receivingId?: number | null; limit?: number } = {},
): Promise<PendingWorkItem[]> {
  if (!organizationId || !Number.isFinite(staffId) || staffId <= 0) return [];

  const receivingId =
    opts.receivingId != null && Number.isFinite(opts.receivingId) && opts.receivingId > 0
      ? Math.trunc(opts.receivingId)
      : null;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

  const res = await tenantQuery<OpenExceptionRow>(
    organizationId,
    `
    SELECT
      rc.id AS receiving_id,
      COALESCE(rc.zoho_purchaseorder_number, rc.zoho_purchaseorder_id) AS order_ref,
      NULLIF(regexp_replace(COALESCE(rc.zendesk_ticket, ''), '^#', ''), '') AS ticket_number,
      COUNT(*)::int AS open_count,
      MAX(e.created_at) AS latest_at,
      ARRAY_AGG(DISTINCT e.exception_code) AS codes
    FROM receiving_exceptions e
    JOIN receiving_carton rc
      ON rc.id = e.receiving_id AND rc.organization_id = e.organization_id
    WHERE e.organization_id = $1
      AND e.created_by = $2
      AND e.status = 'OPEN'
      AND e.receiving_id IS NOT NULL
      AND e.created_at > now() - ($4::int * interval '1 day')
      AND ($3::int IS NULL OR rc.id = $3::int)
    GROUP BY rc.id, rc.zoho_purchaseorder_number, rc.zoho_purchaseorder_id, rc.zendesk_ticket
    ORDER BY MAX(e.created_at) DESC
    LIMIT ${limit}
    `,
    [organizationId, Math.trunc(staffId), receivingId, EXCEPTION_RECENCY_DAYS],
  );

  return res.rows.map((r) => {
    const count = Number(r.open_count) || 0;
    // Name the codes rather than saying "N exceptions": SHORT and DAMAGED lead
    // to completely different next actions, and the operator should be able to
    // decide whether to walk over from the card itself.
    const labels = (r.codes ?? [])
      .filter(Boolean)
      .map((c) => receivingExceptionLabel(c))
      .join(' · ');
    return {
      source: 'open-exception' as const,
      key: `open-exception:${r.receiving_id}:${count}`,
      receivingId: Number(r.receiving_id),
      headline: labels
        ? `${count} unresolved exception${count === 1 ? '' : 's'}: ${labels}`
        : `${count} unresolved exception${count === 1 ? '' : 's'} on this carton`,
      ticketNumber: r.ticket_number ?? null,
      orderRef: r.order_ref ?? null,
      count,
      latestAt: String(r.latest_at),
      action: 'navigate' as const,
      actionLabel: 'Open carton',
      href: cartonReadHref(Number(r.receiving_id)),
    };
  });
}

/** NAS archive backlog, adapted onto the shared item shape. */
async function listArchiveWork(
  organizationId: string,
  staffId: number,
  opts: { receivingId?: number | null; limit?: number },
): Promise<PendingWorkItem[]> {
  const rows = await listPendingNasArchives(organizationId, staffId, opts);
  return rows.map((r) => ({
    source: 'nas-archive' as const,
    key: `nas-archive:${r.receivingId}:${r.pendingCount}`,
    receivingId: r.receivingId,
    headline: `${r.pendingCount} photo${r.pendingCount === 1 ? '' : 's'} taken since this ticket was filed ${
      r.neverArchived ? 'have never been' : 'are not'
    } synced.`,
    ticketNumber: r.ticketNumber,
    orderRef: r.orderRef,
    count: r.pendingCount,
    latestAt: r.latestAt,
    action: 'commit' as const,
    actionLabel: 'Archive photos',
  }));
}

/**
 * Every source has this exact signature, so a new one CANNOT be registered
 * without taking both the org and the staff id. The card follows the operator
 * across cartons, so an org-only source would put a colleague's work in this
 * operator's corner — that is a scoping bug the compiler now refuses.
 */
type PendingWorkSourceFn = (
  organizationId: string,
  staffId: number,
  opts: { receivingId?: number | null; limit?: number },
) => Promise<PendingWorkItem[]>;

const SOURCES: readonly PendingWorkSourceFn[] = [listArchiveWork, listOpenReceivingExceptions];

/**
 * Every source, merged newest-first.
 *
 * A failing source degrades to empty rather than taking the card down with it —
 * a photo-archive outage must not hide an unresolved DAMAGED exception.
 */
export async function listPendingWork(
  organizationId: string,
  staffId: number,
  opts: { receivingId?: number | null; limit?: number } = {},
): Promise<PendingWorkItem[]> {
  const settled = await Promise.allSettled(
    SOURCES.map((run) => run(organizationId, staffId, opts)),
  );

  const items = settled.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`[pending-work] source ${i} failed`, r.reason);
    return [];
  });

  return orderPendingWork(items);
}
