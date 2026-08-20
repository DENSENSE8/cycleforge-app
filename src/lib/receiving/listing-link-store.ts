/**
 * receiving_listing_links — the DURABLE listing-link store for an inbound
 * carton (migration `2026-08-10f`). This module is the writer half the
 * migration header parked: N labeled links per carton, the buyer's ordering,
 * and an explicit line binding.
 *
 * Read waist stays {@link collectCartonListingLinks} — it merges these rows
 * over the computed tiers. Only the two DURABLE sources live here
 * (`manual` | `sync_notes`, CHECK-enforced); `catalog` / `derived` are resolved
 * at read time and are NOT editable, because materializing a fallback would
 * freeze a guess into a fact.
 *
 * Executor pattern (same shape as `transitionReceivingLine`): pass a `db` to
 * run inside a caller's transaction, or let the call own a
 * {@link withTenantTransaction}. `orgId` is REQUIRED on every entry — it comes
 * from `ctx.organizationId`, never a body.
 */

import type { PoolClient } from 'pg';
import { normalizeListingHref } from '@/lib/receiving/listing-href';
import type { StoredCartonListingLink } from '@/lib/receiving/listing-links';
import type { OrgId } from '@/lib/tenancy/constants';

type Executor = Pick<PoolClient, 'query'>;

/** The two durable tiers — mirrors `receiving_listing_links_source_chk`. */
type StoredListingLinkSource = StoredCartonListingLink['source'];

/**
 * A durable row. Extends the resolver's structural input on purpose: what this
 * module writes is exactly what `collectCartonListingLinks` reads back, so the
 * two can never drift into two shapes for one fact.
 */
export interface StoredListingLink extends StoredCartonListingLink {
  receivingId: number;
  /** NULL until an unboxer binds this link to a line (a recorded act). */
  receivingLineId: number | null;
  sortOrder: number;
  boundBy: number | null;
  boundAt: string | null;
}

/** Domain failures a route maps to 400 / 404 / 409 — never thrown strings. */
export type ListingLinkError =
  | 'INVALID_HREF'
  | 'DUPLICATE_HREF'
  | 'NOT_FOUND'
  | 'CARTON_NOT_FOUND'
  | 'BIND_REQUIRES_STAFF'
  | 'NOTHING_TO_UPDATE';

type ListingLinkResult<T> = { ok: true; value: T } | { ok: false; error: ListingLinkError };

interface Row {
  id: string | number;
  receiving_id: number;
  receiving_line_id: number | null;
  href: string;
  label: string | null;
  source: StoredListingLinkSource;
  sort_order: number;
  bound_by: number | null;
  bound_at: string | Date | null;
}

const SELECT_COLS = `id, receiving_id, receiving_line_id, href, label, source, sort_order, bound_by, bound_at`;

function toLink(row: Row): StoredListingLink {
  return {
    id: Number(row.id),
    receivingId: row.receiving_id,
    receivingLineId: row.receiving_line_id,
    href: row.href,
    label: row.label,
    source: row.source,
    sortOrder: row.sort_order,
    boundBy: row.bound_by,
    boundAt: row.bound_at instanceof Date ? row.bound_at.toISOString() : row.bound_at,
  };
}

/**
 * Runs `fn` on the caller's executor, or opens one org-scoped transaction.
 *
 * `@/lib/tenancy/db` is imported LAZILY: it pulls `@/lib/db` (`server-only` +
 * the Neon driver), and a static import would put that whole graph behind
 * anything importing this module — including the DB-free unit tests, which
 * pass their own executor and must never touch a pool.
 */
async function run<T>(orgId: OrgId, db: Executor | undefined, fn: (x: Executor) => Promise<T>): Promise<T> {
  if (db) return fn(db);
  const { withTenantTransaction } = await import('@/lib/tenancy/db');
  return withTenantTransaction(orgId, (client) => fn(client));
}

/** Every durable link for a carton, in the buyer's triage order. */
export async function listCartonListingLinks(
  orgId: OrgId,
  receivingId: number,
  db?: Executor,
): Promise<StoredListingLink[]> {
  return run(orgId, db, async (x) => {
    const { rows } = await x.query<Row>(
      `SELECT ${SELECT_COLS}
         FROM receiving_listing_links
        WHERE organization_id = $1 AND receiving_id = $2
        ORDER BY sort_order ASC, id ASC`,
      [orgId, receivingId],
    );
    return rows.map(toLink);
  });
}

/**
 * Append a link to the carton. `sortOrder` defaults to the end — the buyer's
 * order is a sequence an operator extends, never a slot they collide into.
 */
export async function createListingLink(
  orgId: OrgId,
  args: {
    receivingId: number;
    href: string;
    label?: string | null;
    source?: StoredListingLinkSource;
    receivingLineId?: number | null;
  },
  db?: Executor,
): Promise<ListingLinkResult<StoredListingLink>> {
  const href = normalizeListingHref(args.href);
  if (!href) return { ok: false, error: 'INVALID_HREF' };

  return run(orgId, db, async (x) => {
    // The FK targets `receiving_carton` globally, so org scoping on the INSERT
    // alone would let one tenant hang a link off another tenant's box. The
    // parent check is the isolation here.
    const owns = await x.query<{ id: number }>(
      `SELECT id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [args.receivingId, orgId],
    );
    if (owns.rows.length === 0) return { ok: false as const, error: 'CARTON_NOT_FOUND' as const };

    const { rows } = await x.query<Row>(
      `INSERT INTO receiving_listing_links
         (organization_id, receiving_id, receiving_line_id, href, label, source, sort_order)
       SELECT $1, $2, $3, $4, $5, $6,
              COALESCE((SELECT MAX(sort_order) + 1
                          FROM receiving_listing_links
                         WHERE organization_id = $1 AND receiving_id = $2), 0)
       ON CONFLICT (organization_id, receiving_id, lower(href)) DO NOTHING
       RETURNING ${SELECT_COLS}`,
      [
        orgId,
        args.receivingId,
        args.receivingLineId ?? null,
        href,
        args.label?.trim() || null,
        args.source ?? 'manual',
      ],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'DUPLICATE_HREF' as const };
    return { ok: true as const, value: toLink(row) };
  });
}

/**
 * Edit one link. Binding to a line REQUIRES `boundBy` — who bound it is the
 * fact that makes the binding a recorded act instead of an inference, so it is
 * a required argument with no default (backend-patterns → safety classification).
 */
export async function updateListingLink(
  orgId: OrgId,
  args: {
    id: number;
    href?: string;
    label?: string | null;
    /** `number` binds, `null` unbinds. Omit to leave the binding untouched. */
    receivingLineId?: number | null;
    /** Staff id performing a bind — required whenever `receivingLineId` is a number. */
    boundBy?: number | null;
  },
  db?: Executor,
): Promise<ListingLinkResult<StoredListingLink>> {
  const sets: string[] = [];
  const params: unknown[] = [orgId, args.id];
  let idx = 3;

  if (args.href !== undefined) {
    const href = normalizeListingHref(args.href);
    if (!href) return { ok: false, error: 'INVALID_HREF' };
    sets.push(`href = $${idx++}`);
    params.push(href);
  }
  if (args.label !== undefined) {
    sets.push(`label = $${idx++}`);
    params.push(args.label?.trim() || null);
  }
  if (args.receivingLineId !== undefined) {
    if (args.receivingLineId !== null && !args.boundBy) {
      return { ok: false, error: 'BIND_REQUIRES_STAFF' };
    }
    sets.push(`receiving_line_id = $${idx++}`);
    params.push(args.receivingLineId);
    sets.push(`bound_by = $${idx++}`);
    params.push(args.receivingLineId === null ? null : args.boundBy ?? null);
    sets.push(args.receivingLineId === null ? 'bound_at = NULL' : 'bound_at = now()');
  }
  if (sets.length === 0) return { ok: false, error: 'NOTHING_TO_UPDATE' };

  return run(orgId, db, async (x) => {
    const { rows } = await x.query<Row>(
      `UPDATE receiving_listing_links
          SET ${sets.join(', ')}, updated_at = now()
        WHERE organization_id = $1 AND id = $2
      RETURNING ${SELECT_COLS}`,
      params,
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'NOT_FOUND' as const };
    return { ok: true as const, value: toLink(row) };
  });
}

export async function deleteListingLink(
  orgId: OrgId,
  id: number,
  db?: Executor,
): Promise<ListingLinkResult<{ id: number }>> {
  return run(orgId, db, async (x) => {
    const { rows } = await x.query<{ id: string | number }>(
      `DELETE FROM receiving_listing_links
        WHERE organization_id = $1 AND id = $2
      RETURNING id`,
      [orgId, id],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: 'NOT_FOUND' as const };
    return { ok: true as const, value: { id: Number(row.id) } };
  });
}

/**
 * Rewrite the triage order for a carton. Only the ids named are renumbered
 * (to their 1-based position); any row left out keeps the `sort_order` it has.
 * A partial list reorders — it never deletes.
 */
export async function reorderListingLinks(
  orgId: OrgId,
  args: { receivingId: number; orderedIds: number[] },
  db?: Executor,
): Promise<StoredListingLink[]> {
  return run(orgId, db, async (x) => {
    if (args.orderedIds.length > 0) {
      await x.query(
        `UPDATE receiving_listing_links AS l
            SET sort_order = o.ord, updated_at = now()
           FROM unnest($3::bigint[]) WITH ORDINALITY AS o(link_id, ord)
          WHERE l.organization_id = $1
            AND l.receiving_id = $2
            AND l.id = o.link_id`,
        [orgId, args.receivingId, args.orderedIds],
      );
    }
    return listCartonListingLinks(orgId, args.receivingId, x);
  });
}
