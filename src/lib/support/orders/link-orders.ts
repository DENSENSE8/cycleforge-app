/**
 * Exact order links on a Support item.
 *
 * A link is a `ticket_links` row (entity_type 'ORDER', entity_id = the exact
 * `orders.id`, link_role 'reference') with the pasted text kept beside it as
 * `external_reference`. The item's ONE primary order is
 * `support_tickets.primary_order_id` — `ticket_links.is_primary` stays the
 * item's cross-entity anchor flag and is not touched here.
 *
 * Every function runs on the caller's transaction client (ingest, the
 * orders route) and scopes every statement by `organization_id`.
 */
import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { SupportInputError } from '@/lib/support/conversation/store';

export type SupportOrderLinkErrorCode =
  | 'item_not_found'
  | 'order_not_found'
  | 'multiple_primary'
  | 'check_in_order_locked';

const LINK_ERROR_STATUS: Readonly<Record<SupportOrderLinkErrorCode, 400 | 404 | 409>> = {
  item_not_found: 404,
  order_not_found: 404,
  multiple_primary: 400,
  check_in_order_locked: 409,
};

/**
 * A refusal (nothing written). A `SupportInputError`, so ingest and the
 * Support routes answer its `status` (404 / 400 / 409) instead of a 500.
 */
export class SupportOrderLinkError extends SupportInputError {
  constructor(
    readonly code: SupportOrderLinkErrorCode,
    message: string,
    readonly orderIds: number[] = [],
  ) {
    super(LINK_ERROR_STATUS[code], message);
    this.name = 'SupportOrderLinkError';
  }
}

interface ItemRow {
  id: string | number;
  provider: string;
  external_ticket_id: string | null;
  kind: string;
  primary_order_id: number | null;
}

async function lockItem(client: Pick<PoolClient, 'query'>, orgId: OrgId, supportItemId: number): Promise<ItemRow> {
  const res = await client.query<ItemRow>(
    `SELECT id, provider, external_ticket_id, kind, primary_order_id
       FROM support_tickets
      WHERE organization_id = $1 AND id = $2
      FOR UPDATE`,
    [orgId, supportItemId],
  );
  const item = res.rows[0];
  if (!item) throw new SupportOrderLinkError('item_not_found', `Support item ${supportItemId} not found`);
  return item;
}

/** Zendesk-bound items keep the legacy zendesk_ticket_id on their links so older readers still see them. */
function zendeskTicketIdOf(item: ItemRow): number | null {
  if (item.provider !== 'zendesk') return null;
  const n = Number(item.external_ticket_id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Link exact orders to a Support item and settle its primary order.
 *
 * - Every `orderId` must be an `orders.id` of this org (else `order_not_found`, nothing written).
 * - At most one link may be marked primary (else `multiple_primary`).
 * - A marked primary replaces the item's primary order; with none marked, an
 *   item that has no primary yet takes the first link as primary — so a
 *   linked item always has exactly one.
 * - A post-purchase check-in item's primary order is its check-in's order and
 *   never moves (`check_in_order_locked`).
 * - Re-linking is idempotent; a new non-empty external reference replaces the stored one.
 */
export async function linkSupportItemOrders(
  client: PoolClient,
  args: {
    orgId: OrgId;
    supportItemId: number;
    links: Array<{ orderId: number; primary?: boolean; externalReference?: string | null }>;
    staffId: number | null;
  },
): Promise<{ linked: number[]; primaryOrderId: number | null }> {
  const { orgId, supportItemId, staffId } = args;
  const item = await lockItem(client, orgId, supportItemId);
  const currentPrimary = item.primary_order_id != null ? Number(item.primary_order_id) : null;

  // One entry per orders.id, first occurrence wins; primary is sticky across duplicates.
  const byId = new Map<number, { primary: boolean; externalReference: string | null }>();
  for (const link of args.links) {
    const id = Number(link.orderId);
    const prev = byId.get(id);
    const ref = String(link.externalReference ?? '').trim() || null;
    byId.set(id, {
      primary: Boolean(prev?.primary || link.primary),
      externalReference: prev?.externalReference ?? ref,
    });
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return { linked: [], primaryOrderId: currentPrimary };

  const invalid = ids.filter((id) => !Number.isSafeInteger(id) || id <= 0);
  if (invalid.length > 0) {
    throw new SupportOrderLinkError('order_not_found', `Not an order id: ${invalid.join(', ')}`, invalid);
  }
  const marked = ids.filter((id) => byId.get(id)!.primary);
  if (marked.length > 1) {
    throw new SupportOrderLinkError('multiple_primary', 'Only one order can be the primary order', marked);
  }

  const found = await client.query<{ id: number }>(
    `SELECT id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [orgId, ids],
  );
  const known = new Set(found.rows.map((r) => Number(r.id)));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new SupportOrderLinkError('order_not_found', `Order ${missing.join(', ')} not found`, missing);
  }

  const nextPrimary = marked[0] ?? currentPrimary ?? ids[0];
  if (item.kind === 'post_purchase_check_in' && currentPrimary != null && nextPrimary !== currentPrimary) {
    throw new SupportOrderLinkError(
      'check_in_order_locked',
      "A check-in's order is fixed; link other orders without making them primary",
      [nextPrimary],
    );
  }

  await client.query(
    `INSERT INTO ticket_links
       (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
        link_role, external_reference, created_by)
     SELECT $1, $2, $3, 'ORDER', u.order_id, 'reference', u.external_reference, $6
       FROM unnest($4::bigint[], $5::text[]) AS u(order_id, external_reference)
     ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id) DO UPDATE
       SET external_reference = COALESCE(EXCLUDED.external_reference, ticket_links.external_reference),
           updated_at = now()`,
    [
      orgId,
      supportItemId,
      zendeskTicketIdOf(item),
      ids,
      ids.map((id) => byId.get(id)!.externalReference),
      staffId,
    ],
  );

  if (nextPrimary !== currentPrimary) {
    await client.query(
      `UPDATE support_tickets
          SET primary_order_id = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, supportItemId, nextPrimary],
    );
  }
  return { linked: ids, primaryOrderId: nextPrimary };
}

/**
 * Remove one order link. Unlinking the primary promotes the oldest remaining
 * order link (or clears the primary). A check-in item's own order cannot be
 * unlinked.
 */
export async function unlinkSupportItemOrder(
  client: PoolClient,
  args: { orgId: OrgId; supportItemId: number; orderId: number },
): Promise<{ removed: boolean; primaryOrderId: number | null }> {
  const { orgId, supportItemId, orderId } = args;
  const item = await lockItem(client, orgId, supportItemId);
  const currentPrimary = item.primary_order_id != null ? Number(item.primary_order_id) : null;
  if (item.kind === 'post_purchase_check_in' && currentPrimary === orderId) {
    throw new SupportOrderLinkError('check_in_order_locked', "A check-in's order cannot be unlinked", [orderId]);
  }

  const del = await client.query(
    `DELETE FROM ticket_links
      WHERE organization_id = $1 AND support_ticket_id = $2
        AND entity_type = 'ORDER' AND entity_id = $3`,
    [orgId, supportItemId, orderId],
  );
  const removed = (del.rowCount ?? 0) > 0;
  if (currentPrimary !== orderId) return { removed, primaryOrderId: currentPrimary };

  const next = await client.query<{ entity_id: string | number }>(
    `SELECT entity_id FROM ticket_links
      WHERE organization_id = $1 AND support_ticket_id = $2 AND entity_type = 'ORDER'
      ORDER BY id
      LIMIT 1`,
    [orgId, supportItemId],
  );
  const promoted = next.rows[0] ? Number(next.rows[0].entity_id) : null;
  await client.query(
    `UPDATE support_tickets
        SET primary_order_id = $3, updated_at = now()
      WHERE organization_id = $1 AND id = $2`,
    [orgId, supportItemId, promoted],
  );
  return { removed: removed || currentPrimary === orderId, primaryOrderId: promoted };
}
