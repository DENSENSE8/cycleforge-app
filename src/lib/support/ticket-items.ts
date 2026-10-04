/**
 * support_ticket_items — what we SENT the customer on a support ticket
 * (migration `2026-10-03_items_sent_support_ticket_items`). The structured row
 * is the system of record for the shipment-side of a ticket (task-principles
 * P7); the comment's product card and the "Sent to customer" strip are views of
 * it, read at view time (P6).
 *
 * Deps-injected so validation and idempotency are unit-tested DB-free
 * (`ticket-items.test.ts`). Every write runs inside withTenantTransaction and
 * stamps organization_id explicitly (the migration's safety gate).
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { isTicketItemRole, TICKET_ITEM_MAX_QTY, type TicketItemRole } from './product-token';
import { SKU_CATALOG_JOIN_ON_SQL, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import type {
  SupportProductFace,
  SupportTicketItem,
  SupportTicketItemCreate,
} from './ticket-items-shared';

type Executor = Pick<PoolClient, 'query'>;

export interface TicketItemsDeps {
  runTransaction: <T>(orgId: OrgId, fn: (db: Executor) => Promise<T>) => Promise<T>;
  /** Zendesk ticket number → support_tickets.id (registers the mirror row on first use). */
  resolveSupportTicketId: (orgId: OrgId, zendeskTicketId: number, staffId: number | null) => Promise<number>;
  /** Live product faces by catalog id (identity title, photo, stock). */
  readProductFaces: (orgId: OrgId, ids: readonly number[]) => Promise<SupportProductFace[]>;
}

// Lazy so DB-free tests can inject deps without loading the server-only pool.
const defaultDeps: TicketItemsDeps = {
  runTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, (client) => fn(client));
  },
  resolveSupportTicketId: async (orgId, zendeskTicketId, staffId) => {
    const { upsertSupportTicket } = await import('./tickets');
    const row = await upsertSupportTicket({
      orgId,
      provider: 'zendesk',
      externalTicketId: String(zendeskTicketId),
      staffId,
    });
    return Number(row.id);
  },
  readProductFaces: async (orgId, ids) => {
    const { readIntakeProductsByIds } = await import('@/lib/orders/intake-product-search');
    const hits = await readIntakeProductsByIds(orgId, ids);
    return hits.map(({ skuCatalogId, sku, title, imageUrl, onHand, bin }) => ({
      skuCatalogId,
      sku,
      title,
      imageUrl,
      onHand,
      bin,
    }));
  },
};

export const TICKET_ITEMS_MAX_PER_POST = 20;
const NOTE_MAX = 500;
const CLIENT_EVENT_ID_RE = /^[A-Za-z0-9:_-]{8,120}$/;

/** A rejected write — the route maps `status` straight to the response. */
export class TicketItemsError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Validate a POST batch. Pure; returns the normalized items or throws a 400.
 * The zod schema guards the wire shape; this guards the domain (role, qty
 * range, duplicate client events inside one batch).
 */
export function normalizeTicketItemsInput(items: readonly SupportTicketItemCreate[]): SupportTicketItemCreate[] {
  if (items.length === 0) throw new TicketItemsError(400, 'Pick at least one product.');
  if (items.length > TICKET_ITEMS_MAX_PER_POST) {
    throw new TicketItemsError(400, `At most ${TICKET_ITEMS_MAX_PER_POST} products per send.`);
  }
  const seen = new Set<string>();
  return items.map((it) => {
    if (!Number.isSafeInteger(it.skuCatalogId) || it.skuCatalogId <= 0) {
      throw new TicketItemsError(400, 'Each product needs a catalog id.');
    }
    if (!isTicketItemRole(it.role)) throw new TicketItemsError(400, `Unknown role "${String(it.role)}".`);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > TICKET_ITEM_MAX_QTY) {
      throw new TicketItemsError(400, `Quantity must be 1–${TICKET_ITEM_MAX_QTY}.`);
    }
    const clientEventId = String(it.clientEventId ?? '').trim();
    if (!CLIENT_EVENT_ID_RE.test(clientEventId)) throw new TicketItemsError(400, 'Each product needs a clientEventId.');
    if (seen.has(clientEventId)) throw new TicketItemsError(400, 'Duplicate clientEventId in one send.');
    seen.add(clientEventId);
    const note = typeof it.note === 'string' ? it.note.trim().slice(0, NOTE_MAX) : '';
    return { skuCatalogId: it.skuCatalogId, role: it.role, qty: it.qty, note: note || null, clientEventId };
  });
}

interface ItemRow {
  id: string | number;
  support_ticket_id: string | number;
  sku_catalog_id: number;
  role: TicketItemRole;
  qty: number;
  note: string | null;
  zendesk_comment_id: string | number | null;
  order_id: number | null;
  shipping_label_purchase_id: string | number | null;
  staff_id: number | null;
  staff_name: string | null;
  client_event_id: string;
  created_at: string | Date;
}

const ITEM_COLUMNS = `i.id, i.support_ticket_id, i.sku_catalog_id, i.role, i.qty, i.note,
       i.zendesk_comment_id, i.order_id, i.shipping_label_purchase_id, i.staff_id,
       s.name AS staff_name, i.client_event_id, i.created_at`;

const numOrNull = (v: string | number | null) => (v == null ? null : Number(v));

/** Rows + live faces → wire items; a product the catalog no longer has paints as its id. */
async function toItems(
  orgId: OrgId,
  zendeskTicketId: number,
  rows: ItemRow[],
  deps: TicketItemsDeps,
): Promise<SupportTicketItem[]> {
  const faces = await deps.readProductFaces(orgId, rows.map((r) => Number(r.sku_catalog_id)));
  const byId = new Map(faces.map((f) => [f.skuCatalogId, f]));
  return rows.map((r) => {
    const skuCatalogId = Number(r.sku_catalog_id);
    return {
      id: Number(r.id),
      ticketId: zendeskTicketId,
      role: r.role,
      qty: Number(r.qty),
      note: r.note,
      zendeskCommentId: numOrNull(r.zendesk_comment_id),
      orderId: numOrNull(r.order_id),
      shippingLabelPurchaseId: numOrNull(r.shipping_label_purchase_id),
      staffId: r.staff_id,
      staffName: r.staff_name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      product: byId.get(skuCatalogId) ?? {
        skuCatalogId,
        sku: '',
        title: `Product #${skuCatalogId}`,
        imageUrl: null,
        onHand: 0,
        bin: null,
      },
    };
  });
}

/** Everything logged on one ticket, newest first. */
export async function listTicketItems(
  orgId: OrgId,
  zendeskTicketId: number,
  deps: TicketItemsDeps = defaultDeps,
): Promise<SupportTicketItem[]> {
  const rows = await deps.runTransaction(orgId, async (db) => {
    const res = await db.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM support_ticket_items i
         JOIN support_tickets st ON st.id = i.support_ticket_id AND st.organization_id = i.organization_id
         LEFT JOIN staff s ON s.id = i.staff_id
        WHERE i.organization_id = $1
          AND st.provider = 'zendesk' AND st.external_ticket_id = $2
        ORDER BY i.created_at DESC, i.id DESC`,
      [orgId, String(zendeskTicketId)],
    );
    return res.rows;
  });
  return toItems(orgId, zendeskTicketId, rows, deps);
}

/**
 * Log a batch of picks against a ticket. Idempotent per `clientEventId`: a
 * retried send returns the rows it already wrote (`created: false`) instead of
 * a second shipment. A clientEventId already used on ANOTHER ticket is a 409 —
 * the same event cannot describe two tickets.
 */
export async function recordTicketItems(
  args: {
    orgId: OrgId;
    staffId: number | null;
    zendeskTicketId: number;
    zendeskCommentId?: number | null;
    items: readonly SupportTicketItemCreate[];
  },
  deps: TicketItemsDeps = defaultDeps,
): Promise<{ items: SupportTicketItem[]; created: number }> {
  const items = normalizeTicketItemsInput(args.items);
  const supportTicketId = await deps.resolveSupportTicketId(args.orgId, args.zendeskTicketId, args.staffId);
  const commentId =
    args.zendeskCommentId != null && Number.isSafeInteger(args.zendeskCommentId) && args.zendeskCommentId > 0
      ? args.zendeskCommentId
      : null;

  const { rows, created } = await deps.runTransaction(args.orgId, async (db) => {
    const ids = items.map((it) => it.clientEventId);
    const inserted = await db.query<{ client_event_id: string }>(
      `INSERT INTO support_ticket_items
         (organization_id, support_ticket_id, sku_catalog_id, role, qty, note,
          zendesk_comment_id, staff_id, client_event_id)
       SELECT $1, $2, x.sku_catalog_id, x.role, x.qty, x.note, $3, $4, x.client_event_id
         FROM unnest($5::int[], $6::text[], $7::int[], $8::text[], $9::text[])
              AS x(sku_catalog_id, role, qty, note, client_event_id)
       ON CONFLICT (organization_id, client_event_id) DO NOTHING
       RETURNING client_event_id`,
      [
        args.orgId,
        supportTicketId,
        commentId,
        args.staffId,
        items.map((it) => it.skuCatalogId),
        items.map((it) => it.role),
        items.map((it) => it.qty),
        items.map((it) => it.note ?? null),
        ids,
      ],
    );
    const res = await db.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM support_ticket_items i
         LEFT JOIN staff s ON s.id = i.staff_id
        WHERE i.organization_id = $1 AND i.client_event_id = ANY($2::text[])
        ORDER BY i.id`,
      [args.orgId, ids],
    );
    return { rows: res.rows, created: inserted.rows.length };
  });

  if (rows.some((r) => Number(r.support_ticket_id) !== supportTicketId)) {
    throw new TicketItemsError(409, 'That send was already logged on another ticket.');
  }
  return { items: await toItems(args.orgId, args.zendeskTicketId, rows, deps), created };
}

/** Undo one logged item. Returns the deleted item, or `null` when it is not on this ticket. */
export async function deleteTicketItem(
  args: { orgId: OrgId; zendeskTicketId: number; itemId: number },
  deps: TicketItemsDeps = defaultDeps,
): Promise<SupportTicketItem | null> {
  const rows = await deps.runTransaction(args.orgId, async (db) => {
    const res = await db.query<ItemRow>(
      `WITH gone AS (
         DELETE FROM support_ticket_items i
          USING support_tickets st
          WHERE i.organization_id = $1 AND i.id = $3
            AND st.id = i.support_ticket_id AND st.organization_id = i.organization_id
            AND st.provider = 'zendesk' AND st.external_ticket_id = $2
         RETURNING i.*
       )
       SELECT ${ITEM_COLUMNS} FROM gone i LEFT JOIN staff s ON s.id = i.staff_id`,
      [args.orgId, String(args.zendeskTicketId), args.itemId],
    );
    return res.rows;
  });
  if (rows.length === 0) return null;
  const [item] = await toItems(args.orgId, args.zendeskTicketId, rows, deps);
  return item;
}

const PICKER_SUGGESTION_LIMIT = 8;

/**
 * The picker's just-in-time list before anything is typed: the products on
 * the ticket's linked shipments' orders and receiving lines; when the ticket
 * links none, the staffer's recent picks (then the org's). Most order and
 * receiving rows carry only the SKU text (`sku_catalog_id` is NULL on ~80% of
 * orders and ~94% of receiving lines), so identity resolves through the SKU
 * law join (`sku_catalog.sku`) when the id is missing.
 */
export async function suggestTicketProducts(
  args: { orgId: OrgId; zendeskTicketId: number | null; staffId: number | null },
  deps: TicketItemsDeps = defaultDeps,
): Promise<{ source: 'ticket' | 'recent'; products: SupportProductFace[] }> {
  const { ticketIds, recentIds } = await deps.runTransaction(args.orgId, async (db) => {
    let ticket: number[] = [];
    if (args.zendeskTicketId != null) {
      const res = await db.query<{ sku_catalog_id: number }>(
        `SELECT sku_catalog_id FROM (
           SELECT COALESCE(o.sku_catalog_id, sc.id) AS sku_catalog_id, tl.created_at
             FROM ticket_links tl
             JOIN orders o ON o.organization_id = tl.organization_id AND o.shipment_id = tl.entity_id
             LEFT JOIN sku_catalog sc ON o.sku_catalog_id IS NULL AND ${skuCatalogJoinOnSql('o')}
            WHERE tl.organization_id = $1 AND tl.zendesk_ticket_id = $2
              AND tl.entity_type = 'SHIPMENT'
           UNION ALL
           SELECT COALESCE(rl.sku_catalog_id, sc.id), tl.created_at
             FROM ticket_links tl
             JOIN receiving_lines rl ON rl.organization_id = tl.organization_id
              AND ((tl.entity_type = 'RECEIVING_LINE' AND rl.id = tl.entity_id)
                OR (tl.entity_type = 'RECEIVING' AND rl.receiving_id = tl.entity_id))
             LEFT JOIN sku_catalog sc ON rl.sku_catalog_id IS NULL AND ${SKU_CATALOG_JOIN_ON_SQL}
            WHERE tl.organization_id = $1 AND tl.zendesk_ticket_id = $2
         ) linked
         WHERE sku_catalog_id IS NOT NULL
         GROUP BY sku_catalog_id
         ORDER BY max(created_at) DESC
         LIMIT $3`,
        [args.orgId, args.zendeskTicketId, PICKER_SUGGESTION_LIMIT],
      );
      ticket = res.rows.map((r) => Number(r.sku_catalog_id));
    }
    if (ticket.length > 0) return { ticketIds: ticket, recentIds: [] as number[] };
    const recent = await db.query<{ sku_catalog_id: number }>(
      `SELECT sku_catalog_id
         FROM support_ticket_items
        WHERE organization_id = $1
        GROUP BY sku_catalog_id
        ORDER BY bool_or(staff_id IS NOT DISTINCT FROM $2) DESC, max(created_at) DESC
        LIMIT $3`,
      [args.orgId, args.staffId, PICKER_SUGGESTION_LIMIT],
    );
    return { ticketIds: [] as number[], recentIds: recent.rows.map((r) => Number(r.sku_catalog_id)) };
  });
  if (ticketIds.length > 0) {
    return { source: 'ticket', products: await deps.readProductFaces(args.orgId, ticketIds) };
  }
  return { source: 'recent', products: await deps.readProductFaces(args.orgId, recentIds) };
}
