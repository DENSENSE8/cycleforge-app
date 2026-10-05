import 'server-only';
/**
 * Read a Support item's draft context from the LOCAL store — zero provider
 * calls. Thread (SUPPORT_TICKET), exact linked orders (ORDERS slice), linked
 * repairs / receiving / serials / warranty, product manuals for the products
 * involved, past resolved replies about the same products, and photo evidence.
 * Every fact carries its citation; titles follow the SKU identity law.
 */
import type { QueryResult } from 'pg';
import type { SupportChannel, SupportItemKind, SupportPurpose } from '@/lib/support/conversation/model';
import { readSupportOrderRefs } from '@/lib/support/orders/order-facts';
import { collectPhotoEvidence, type PhotoEvidence } from '@/lib/support/photo-evidence';
import { supportPhotoEvidenceDeps } from '@/lib/support/photo-evidence-deps';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql, SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import { tenantQueriesOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { toPSTDateKey } from '@/utils/date';
import type { SupportClaimKind, SupportDraftContext, SupportDraftFact, SupportDraftMessage } from './context';

/** One paste is a handful of images, not an album. */
const MAX_PHOTOS = 6;
const PAST_REPLY_CHARS = 600;
const PAST_REPLIES = 3;
const MANUALS = 5;

const ITEM_SQL = `
SELECT st.id, st.kind, st.provider, st.purpose, st.subject_cache, st.requester_name, st.requester_email,
       st.requester_handle, st.account_label, st.external_ticket_id
  FROM support_tickets st
 WHERE st.organization_id = $1::uuid AND st.id = $2::bigint`;

const MESSAGES_SQL = `
SELECT tm.id, tm.direction, tm.body, COALESCE(tm.occurred_at, tm.created_at) AS occurred_at, tm.author_label,
       tm.delivery_state, tm.reply_disposition, tm.meta->'photoIds' AS photo_ids
  FROM entity_threads et
  JOIN thread_messages tm ON tm.organization_id = et.organization_id AND tm.thread_id = et.id
 WHERE et.organization_id = $1::uuid AND et.entity_type = 'SUPPORT_TICKET' AND et.entity_id = $2::bigint
   AND tm.deleted_at IS NULL AND tm.direction IS NOT NULL
 ORDER BY COALESCE(tm.occurred_at, tm.created_at), tm.id`;

const LINKS_SQL = `
SELECT tl.entity_type, tl.entity_id
  FROM ticket_links tl
 WHERE tl.organization_id = $1::uuid AND tl.support_ticket_id = $2::bigint
   AND tl.entity_type IN ('REPAIR','RECEIVING','RECEIVING_LINE','SERIAL_UNIT','WARRANTY_CLAIM')`;

/** Linked repairs plus repairs opened against a linked order number. */
const REPAIRS_SQL = `
SELECT r.id, r.ticket_number, r.status, r.issue, r.serial_number, r.received_at, r.updated_at, r.sku,
       r.product_title AS item_name, sc.product_title AS catalog_product_title,
       (SELECT string_agg(concat_ws(' ', ra.action_type, ra.part_name), '; ' ORDER BY ra.created_at DESC)
          FROM (SELECT * FROM repair_actions ra0
                 WHERE ra0.organization_id = r.organization_id AND ra0.repair_id = r.id AND ra0.deleted_at IS NULL
                 ORDER BY ra0.created_at DESC LIMIT 3) ra) AS recent_work
  FROM (SELECT rs.*, rs.source_sku AS sku FROM repair_service rs
         WHERE rs.organization_id = $1::uuid
           AND (rs.id = ANY($2::int[]) OR rs.source_order_id = ANY($3::text[]))) r
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('r')}
 ORDER BY r.updated_at DESC NULLS LAST
 LIMIT 5`;

const RECEIVING_SQL = `
SELECT r.id, r.carrier, r.is_return, r.return_reason, r.qa_status::text, r.disposition_code::text,
       r.condition_grade::text, r.receiving_date_time
  FROM receiving r
 WHERE r.organization_id = $1::uuid AND r.id = ANY($2::int[])`;

const RECEIVING_LINES_SQL = `
SELECT rl.id, rl.receiving_id, rl.sku, rl.item_name, rl.quantity_received, rl.quantity_expected,
       rl.workflow_status::text, rl.received_at, sc.product_title AS catalog_product_title
  FROM receiving_lines rl
  LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
 WHERE rl.organization_id = $1::uuid AND rl.id = ANY($2::int[])`;

const SERIALS_SQL = `
SELECT su.id, su.serial_number, su.sku, su.current_status::text, su.condition_grade::text,
       su.shipping_tracking_number, sc.product_title AS catalog_product_title
  FROM serial_units su
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('su')}
 WHERE su.organization_id = $1::uuid AND su.id = ANY($2::int[])`;

/** Linked claims plus claims filed against a linked order. */
const WARRANTY_SQL = `
SELECT wc.id, wc.claim_number, wc.status, wc.sku, wc.product_title AS item_name, wc.serial_number,
       wc.warranty_starts_at, wc.warranty_expires_at, wc.denial_reason_code, sc.product_title AS catalog_product_title
  FROM warranty_claims wc
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('wc')}
 WHERE wc.organization_id = $1::uuid AND (wc.id = ANY($2::bigint[]) OR wc.order_id = ANY($3::int[]))
 ORDER BY wc.created_at DESC
 LIMIT 5`;

const MANUALS_SQL = `
SELECT pm.id, pm.sku, pm.display_name, pm.file_name, pm.product_title, pm.type, pm.source_url
  FROM product_manuals pm
 WHERE pm.organization_id = $1::uuid AND pm.is_active
   AND (pm.sku = ANY($2::text[]) OR pm.order_id = ANY($3::int[]))
 ORDER BY pm.updated_at DESC NULLS LAST
 LIMIT ${MANUALS}`;

/** Sent / logged replies on OTHER resolved customer conversations about the same SKU, same channel first. */
const PAST_REPLIES_SQL = `
SELECT tm.id, tm.body, st.id AS item_id, st.provider, COALESCE(tm.occurred_at, tm.created_at) AS at
  FROM support_tickets st
  JOIN entity_threads et ON et.organization_id = st.organization_id AND et.entity_type = 'SUPPORT_TICKET' AND et.entity_id = st.id
  JOIN thread_messages tm ON tm.organization_id = et.organization_id AND tm.thread_id = et.id
 WHERE st.organization_id = $1::uuid AND st.id <> $2::bigint
   AND st.lifecycle = 'resolved' AND st.purpose = 'customer_conversation'
   AND tm.direction = 'outbound' AND tm.delivery_state IN ('sent','logged') AND tm.deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM ticket_links tl
                 JOIN orders o ON o.organization_id = tl.organization_id AND o.id = tl.entity_id
                WHERE tl.organization_id = st.organization_id AND tl.support_ticket_id = st.id
                  AND tl.entity_type = 'ORDER' AND o.sku = ANY($3::text[]))
 ORDER BY (st.provider = $4::text) DESC, COALESCE(tm.occurred_at, tm.created_at) DESC
 LIMIT ${PAST_REPLIES}`;

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  const t = v == null ? '' : String(v).trim();
  return t ? t : null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function title(row: Row): string {
  return (
    resolveSkuIdentityTitle({
      catalog_product_title: str(row.catalog_product_title),
      item_name: str(row.item_name),
      sku: str(row.sku),
    }) || 'Unknown product'
  );
}

function ids(links: Row[], type: string): number[] {
  return links.filter((l) => l.entity_type === type).map((l) => Number(l.entity_id));
}

function repairFact(r: Row): SupportDraftFact {
  const status = str(r.status) ?? 'unknown';
  const proves: SupportClaimKind[] = /^(done|repaired)/i.test(status) ? ['repaired'] : [];
  const label = `Repair ${str(r.ticket_number) ?? `#${r.id}`}`;
  const parts = [
    `${label}: ${title(r)}${str(r.serial_number) ? `, serial ${str(r.serial_number)}` : ''}`,
    `status ${status}`,
    str(r.issue) ? `reported issue "${str(r.issue)}"` : null,
    iso(r.received_at) ? `received ${iso(r.received_at)!.slice(0, 10)}` : null,
    str(r.recent_work) ? `recent bench work: ${str(r.recent_work)}` : null,
  ];
  return { citation: { type: 'repair', label, ref: `repair_service:${r.id}` }, text: `${parts.filter(Boolean).join('; ')}.`, proves };
}

function receivingFact(r: Row): SupportDraftFact {
  const label = `Receiving #${r.id}`;
  const parts = [
    `${label}${r.is_return ? ' (customer return)' : ''}`,
    iso(r.receiving_date_time) ? `received ${iso(r.receiving_date_time)!.slice(0, 10)}` : null,
    str(r.carrier) ? `carrier ${str(r.carrier)}` : null,
    str(r.return_reason) ? `return reason "${str(r.return_reason)}"` : null,
    str(r.qa_status) ? `QA ${str(r.qa_status)}` : null,
    str(r.condition_grade) ? `condition ${str(r.condition_grade)}` : null,
    str(r.disposition_code) ? `disposition ${str(r.disposition_code)}` : null,
  ];
  return { citation: { type: 'receiving', label, ref: `receiving:${r.id}` }, text: `${parts.filter(Boolean).join('; ')}.` };
}

function receivingLineFact(r: Row): SupportDraftFact {
  const label = `Receiving line #${r.id}`;
  const qty = r.quantity_received != null ? `${r.quantity_received}${r.quantity_expected != null ? ` of ${r.quantity_expected}` : ''} received` : null;
  const parts = [
    `${label}: ${title(r)}${str(r.sku) ? ` (SKU ${str(r.sku)})` : ''}`,
    qty,
    str(r.workflow_status) ? `stage ${str(r.workflow_status)}` : null,
    iso(r.received_at) ? `on ${iso(r.received_at)!.slice(0, 10)}` : null,
  ];
  return { citation: { type: 'receiving', label, ref: `receiving_lines:${r.id}` }, text: `${parts.filter(Boolean).join('; ')}.` };
}

function serialFact(r: Row): SupportDraftFact {
  const label = `Serial ${str(r.serial_number) ?? `#${r.id}`}`;
  const status = str(r.current_status);
  const proves: SupportClaimKind[] = status === 'SHIPPED' ? ['shipped'] : status === 'REPAIR_DONE' ? ['repaired'] : [];
  const parts = [
    `${label}: ${title(r)}`,
    status ? `status ${status}` : null,
    str(r.condition_grade) ? `condition ${str(r.condition_grade)}` : null,
    str(r.shipping_tracking_number) ? `shipped with tracking ${str(r.shipping_tracking_number)}` : null,
  ];
  return { citation: { type: 'serial', label, ref: `serial_units:${r.id}` }, text: `${parts.filter(Boolean).join('; ')}.`, proves };
}

function warrantyFact(r: Row): SupportDraftFact {
  const label = `Warranty claim ${str(r.claim_number) ?? `#${r.id}`}`;
  const status = str(r.status) ?? 'unknown';
  const proves: SupportClaimKind[] = ['APPROVED', 'IN_REPAIR', 'REPAIRED', 'CLOSED'].includes(status) ? ['warranty_approved'] : [];
  if (status === 'REPAIRED') proves.push('repaired');
  const parts = [
    `${label}: ${title(r)}${str(r.serial_number) ? `, serial ${str(r.serial_number)}` : ''}`,
    `status ${status}`,
    iso(r.warranty_expires_at) ? `warranty ends ${iso(r.warranty_expires_at)!.slice(0, 10)}` : null,
    str(r.denial_reason_code) ? `denial reason ${str(r.denial_reason_code)}` : null,
  ];
  return { citation: { type: 'sku', label, ref: `warranty_claims:${r.id}` }, text: `${parts.filter(Boolean).join('; ')}.`, proves };
}

function manualFact(r: Row): SupportDraftFact {
  const name = str(r.display_name) ?? str(r.file_name) ?? `Manual #${r.id}`;
  const label = `Manual: ${name}`;
  const text = `${name}${str(r.type) ? ` (${str(r.type)})` : ''} for ${str(r.product_title) ?? str(r.sku) ?? 'this product'}${str(r.source_url) ? ` — ${str(r.source_url)}` : ''}.`;
  return { citation: { type: 'manual', label, ref: `product_manuals:${r.id}` }, text };
}

function pastReplyFact(r: Row): SupportDraftFact {
  const body = String(r.body ?? '').trim();
  const clipped = body.length > PAST_REPLY_CHARS ? `${body.slice(0, PAST_REPLY_CHARS)}…` : body;
  return {
    citation: { type: 'past_reply', label: `Resolved conversation #${r.item_id}`, ref: `thread_messages:${r.id}` },
    text: `"${clipped.replace(/\s+/g, ' ')}"`,
  };
}

function photoIdsOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * The full context for one item, or null when the item does not exist in this
 * org. Photo evidence and retrieval arms degrade to empty, never fail the read.
 */
export async function readSupportDraftContext(
  orgId: OrgId,
  supportItemId: number,
  opts: { stagedPhotoIds?: number[]; nowMs?: number } = {},
): Promise<SupportDraftContext | null> {
  const [[itemRes, messagesRes, linksRes], orders] = await Promise.all([
    tenantQueriesOneTrip<Row>(orgId, [
      { text: ITEM_SQL, params: [orgId, supportItemId] },
      { text: MESSAGES_SQL, params: [orgId, supportItemId] },
      { text: LINKS_SQL, params: [orgId, supportItemId] },
    ]),
    readSupportOrderRefs(orgId, supportItemId),
  ]);
  const item = itemRes.rows[0];
  if (!item) return null;

  const messages: SupportDraftMessage[] = messagesRes.rows.map((m) => ({
    id: Number(m.id),
    direction: m.direction as SupportDraftMessage['direction'],
    body: String(m.body ?? ''),
    occurredAt: iso(m.occurred_at) ?? new Date(0).toISOString(),
    authorLabel: str(m.author_label),
    deliveryState: (m.delivery_state as SupportDraftMessage['deliveryState']) ?? null,
    replyDisposition: (m.reply_disposition as SupportDraftMessage['replyDisposition']) ?? null,
  }));
  const links = linksRes.rows;
  const orderIds = orders.map((o) => o.orderId);
  const orderNumbers = orders.map((o) => o.orderNumber).filter((n): n is string => Boolean(n));

  // Staged photos first (the staffer's question), then the newest message photos.
  const photoIds = [
    ...new Set([...(opts.stagedPhotoIds ?? []), ...messagesRes.rows.flatMap((m) => photoIdsOf(m.photo_ids)).reverse()]),
  ].slice(0, MAX_PHOTOS);

  const [records, photos] = await Promise.all([
    tenantQueriesOneTrip<Row>(orgId, [
      { text: REPAIRS_SQL, params: [orgId, ids(links, 'REPAIR'), orderNumbers] },
      { text: RECEIVING_SQL, params: [orgId, ids(links, 'RECEIVING')] },
      { text: RECEIVING_LINES_SQL, params: [orgId, ids(links, 'RECEIVING_LINE')] },
      { text: SERIALS_SQL, params: [orgId, ids(links, 'SERIAL_UNIT')] },
      { text: WARRANTY_SQL, params: [orgId, ids(links, 'WARRANTY_CLAIM'), orderIds] },
    ]),
    photoIds.length
      ? collectPhotoEvidence(photoIds, supportPhotoEvidenceDeps(orgId)).catch((err): PhotoEvidence[] => {
          console.warn('[support/drafts] photo evidence failed', (err as Error)?.message);
          return [];
        })
      : Promise.resolve([] as PhotoEvidence[]),
  ]);
  const [repairs, receiving, receivingLines, serials, warranty] = records as Array<QueryResult<Row>>;

  const skus = [
    ...new Set(
      [
        ...orders.flatMap((o) => o.products.map((p) => p.sku)),
        ...repairs.rows.map((r) => str(r.sku)),
        ...receivingLines.rows.map((r) => str(r.sku)),
        ...serials.rows.map((r) => str(r.sku)),
        ...warranty.rows.map((r) => str(r.sku)),
      ].filter((s): s is string => Boolean(s)),
    ),
  ];
  const [manuals, pastReplies] =
    skus.length || orderIds.length
      ? await tenantQueriesOneTrip<Row>(orgId, [
          { text: MANUALS_SQL, params: [orgId, skus, orderIds] },
          { text: PAST_REPLIES_SQL, params: [orgId, supportItemId, skus, String(item.provider)] },
        ])
      : [{ rows: [] as Row[] }, { rows: [] as Row[] }];

  return {
    item: {
      id: Number(item.id),
      kind: item.kind as SupportItemKind,
      channel: item.provider as SupportChannel,
      purpose: item.purpose as SupportPurpose,
      subject: str(item.subject_cache),
      requesterName: str(item.requester_name),
      requesterEmail: str(item.requester_email),
      requesterHandle: str(item.requester_handle),
      accountLabel: str(item.account_label),
      externalTicketId: str(item.external_ticket_id),
    },
    today: toPSTDateKey(new Date(opts.nowMs ?? Date.now())),
    messages,
    orders,
    facts: [
      ...repairs.rows.map(repairFact),
      ...receiving.rows.map(receivingFact),
      ...receivingLines.rows.map(receivingLineFact),
      ...serials.rows.map(serialFact),
      ...warranty.rows.map(warrantyFact),
      ...manuals.rows.map(manualFact),
      ...pastReplies.rows.map(pastReplyFact),
    ],
    photos,
  };
}

/**
 * The local Support item a station (helpdesk) ticket number maps to, with
 * whether its canonical thread still needs filling from the local mirror.
 */
export async function readStationSupportItem(
  orgId: OrgId,
  externalTicketId: number,
): Promise<{ supportItemId: number; needsMirrorSync: boolean } | null> {
  const [{ rows }] = await tenantQueriesOneTrip<Row>(orgId, [
    {
      text: `
SELECT st.id,
       EXISTS (SELECT 1 FROM entity_threads et
                 JOIN thread_messages tm ON tm.organization_id = et.organization_id AND tm.thread_id = et.id
                WHERE et.organization_id = st.organization_id AND et.entity_type = 'SUPPORT_TICKET'
                  AND et.entity_id = st.id AND tm.deleted_at IS NULL) AS has_thread,
       EXISTS (SELECT 1 FROM support_ticket_comments c
                WHERE c.organization_id = st.organization_id AND c.support_ticket_id = st.id) AS has_mirror
  FROM support_tickets st
 WHERE st.organization_id = $1::uuid AND st.provider = 'zendesk' AND st.external_ticket_id = $2::text`,
      params: [orgId, String(externalTicketId)],
    },
  ]);
  const row = rows[0];
  if (!row) return null;
  return { supportItemId: Number(row.id), needsMirrorSync: !row.has_thread && Boolean(row.has_mirror) };
}
