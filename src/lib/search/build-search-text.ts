/**
 * buildSearchText — canonical denormalized text + display fields + facets for
 * one entity_search_docs row (AI search Phase 0,
 * docs/ai-search-modernization-plan.md).
 *
 * Pure functions: the outbox worker (search-outbox-worker.ts) loads parent
 * rows org-scoped with the SQL aliases documented per entity below, then this
 * module turns a row into `{ title, subtitle, searchText, facets }`. Keep the
 * fields here in sync with the trigger UPDATE OF column lists in migration
 * 2026-07-03d — a column searched here but missing there goes stale silently.
 *
 * Mirrors what global-search already queries per entity (order ids, titles,
 * SKUs, serials, tracking, source platform) plus notes/facets. Title SoT
 * rules honored: serial-unit titles prefer `items.name` (joined on
 * zoho_item_id — never the SKU string) with sku_catalog.product_title as
 * fallback; sku_catalog rows are their own namespace and use product_title.
 */

import {
  receivingOrderIdFromParts,
  receivingSearchTitle,
} from '@/lib/search/receiving-search-title';

export type SearchEntityType =
  | 'ORDER'
  | 'SERIAL_UNIT'
  | 'RECEIVING'
  | 'SKU'
  | 'REPAIR'
  | 'FBA_SHIPMENT'
  | 'WARRANTY_CLAIM'
  | 'SUPPORT_TICKET'
  | 'LOCATION';

export const SEARCH_ENTITY_TYPES: readonly SearchEntityType[] = [
  'ORDER',
  'SERIAL_UNIT',
  'RECEIVING',
  'SKU',
  'REPAIR',
  'FBA_SHIPMENT',
  'WARRANTY_CLAIM',
  'SUPPORT_TICKET',
  'LOCATION',
] as const;

export function isSearchEntityType(value: string): value is SearchEntityType {
  return (SEARCH_ENTITY_TYPES as readonly string[]).includes(value);
}

export interface SearchDocFacets {
  status: string | null;
  conditionGrade: string | null;
  sourcePlatform: string | null;
  /** Carrier tracking number (order/receiving) — powers the row's tracking chip. */
  trackingNumber: string | null;
  /** Carrier name (order/receiving) — the tracking chip's leading label. */
  carrier: string | null;
  /**
   * Full serial string (SERIAL_UNIT / REPAIR) — journey handoff key for
   * `/operations?mode=history&dim=serial` without a second fetch.
   */
  serialNumber: string | null;
  happenedAt: Date | null;
}

export interface BuiltSearchDoc {
  title: string;
  subtitle: string | null;
  searchText: string;
  facets: SearchDocFacets;
}

/** Raw loader row — snake_case aliases exactly as the worker SQL selects them. */
export type SearchSourceRow = Record<string, unknown>;

// Embedding inputs are billed per token and long tails add no recall for
// entity docs — cap the canonical text.
const MAX_SEARCH_TEXT = 2000;

function str(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function dateOrNull(...candidates: unknown[]): Date | null {
  for (const c of candidates) {
    if (c == null) continue;
    const d = c instanceof Date ? c : new Date(String(c));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Join, drop blanks, dedupe (case-insensitive), cap length. */
function joinSearchText(parts: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const s = str(part);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.join(' \n').slice(0, MAX_SEARCH_TEXT);
}

function subtitleOf(parts: unknown[]): string | null {
  const s = parts.map(str).filter(Boolean).join(' · ');
  return s ? s : null;
}

/**
 * Ticket-number tokens. Staff type `#1234` as often as `1234` and the keyword
 * arm is a literal trigram match over search_text, so BOTH spellings go in —
 * `joinSearchText` dedupes, and a bare id is a 4-gram the `#` form does not
 * contain. Returns [] for a blank id so no lone `#` reaches the text.
 */
function ticketTokens(value: unknown): string[] {
  const bare = str(value).replace(/^#+/, '');
  return bare ? [`#${bare}`, bare] : [];
}

/**
 * Loader row contract (worker SQL):
 *   id, order_id, product_title, sku, account_source, status, condition,
 *   notes, order_date, created_at, serials (STRING_AGG of
 *   tech_serial_numbers.serial_number), tracking_number (primary STN raw),
 *   linked_trackings (shipment_links STNs, space-joined), carrier
 *   (stn.carrier, UNKNOWN→null), customer_name / customer_email /
 *   customer_phone (LEFT JOIN customers ON orders.customer_id),
 *   note_trail (5 newest order_notes.note_text, newest first, ≤600 chars),
 *   allocated_serials (order_unit_allocations → serial_units.serial_number,
 *   space-joined, RELEASED excluded).
 *
 * BUYER IDENTITY IN THE SUBTITLE
 *   The customer leads the subtitle when there is one. A support call opens
 *   with a person's name, so that is the field which tells the operator "this
 *   is the row you want" at a glance — and putting it first is what keeps the
 *   answer at interaction two instead of three.
 *
 * SEARCH-TEXT ORDER IS A TRUNCATION CONTRACT, NOT A RANKING ONE
 *   The keyword arm matches `lower(search_text)` with =, LIKE and <%
 *   (hybrid-retrieval.ts:120-127) — all position-insensitive, so ordering
 *   cannot change a score. What it DOES decide is what survives the
 *   MAX_SEARCH_TEXT cap. Short high-selectivity terms (ids, serials,
 *   trackings, email, phone) therefore go ahead of unbounded prose; the two
 *   free-text sources (orders.notes, the note trail) go last, where losing a
 *   tail costs the least recall.
 */
function buildOrderDoc(row: SearchSourceRow): BuiltSearchDoc {
  const title = str(row.product_title) || `Order #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([
      row.customer_name,
      row.order_id,
      row.serials,
      row.sku,
      row.account_source,
    ]),
    searchText: joinSearchText([
      row.order_id,
      row.product_title,
      row.sku,
      row.serials,
      // Serials bound through `order_unit_allocations` — the modern path.
      // `serials` above is the legacy tech_serial_numbers ledger; an order
      // allocated the new way had no serial in its doc at all. Short and
      // high-selectivity, so it sits with the other identifiers, ahead of prose.
      row.allocated_serials,
      row.tracking_number,
      row.linked_trackings,
      row.account_source,
      row.status,
      row.condition,
      // Buyer identity: a name, an email, a phone are exactly what a support
      // call supplies, and all three are short — they belong ahead of prose
      // so an order with a long note trail never loses them to the cap.
      row.customer_name,
      row.customer_email,
      row.customer_phone,
      row.notes,
      // The notes TABLE (order_notes) — every note staff write through the
      // trail. Until this landed only the single orders.notes COLUMN was
      // indexed, so the trail was unsearchable.
      row.note_trail,
    ]),
    facets: {
      status: strOrNull(row.status),
      conditionGrade: strOrNull(row.condition),
      sourcePlatform: strOrNull(row.account_source),
      trackingNumber: strOrNull(row.tracking_number),
      carrier: strOrNull(row.carrier),
      serialNumber: null,
      happenedAt: dateOrNull(row.order_date, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, serial_number, unit_uid, sku, current_status, condition_grade,
 *   current_location, notes, received_at, created_at,
 *   shipping_tracking_number, product_title (COALESCE(items.name via
 *   zoho_item_id, sku_catalog.product_title via sku_catalog_id)),
 *   handling_unit_code (handling_units.code via serial_units.handling_unit_id
 *   — the H- tote label a picker is holding).
 */
function buildSerialUnitDoc(row: SearchSourceRow): BuiltSearchDoc {
  const title = str(row.product_title) || str(row.serial_number) || `Unit #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([row.serial_number, row.sku, row.current_status]),
    searchText: joinSearchText([
      row.serial_number,
      row.unit_uid,
      row.sku,
      row.product_title,
      row.current_location,
      row.handling_unit_code,
      row.shipping_tracking_number,
      row.current_status,
      row.condition_grade,
      row.notes,
    ]),
    facets: {
      status: strOrNull(row.current_status),
      conditionGrade: strOrNull(row.condition_grade),
      sourcePlatform: null,
      trackingNumber: strOrNull(row.shipping_tracking_number),
      carrier: null,
      serialNumber: strOrNull(row.serial_number),
      happenedAt: dateOrNull(row.received_at, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, tracking_number (stn raw), carrier, po_number
 *   (zoho_purchaseorder_number), source_order_id, source_platform, intake_type,
 *   exception_code, support_notes, zoho_notes, condition_grade,
 *   qa_status, received_at, created_at, line_item_names, line_skus,
 *   line_count, distinct_sku_count, first_item_name
 *   (aggregates over receiving_line).
 */
function buildReceivingDoc(row: SearchSourceRow): BuiltSearchDoc {
  const poNumber = strOrNull(row.po_number);
  const sourceOrderId = strOrNull(row.source_order_id);
  const sourcePlatform = strOrNull(row.source_platform);
  const firstItemName = strOrNull(row.first_item_name);
  const lineCount = Number(row.line_count) || 0;
  const distinctSkuCount = Number(row.distinct_sku_count) || 0;
  const orderId = receivingOrderIdFromParts(poNumber, sourceOrderId);
  const title = receivingSearchTitle({
    lineCount,
    distinctSkuCount,
    poNumber,
    sourceOrderId,
    sourcePlatform,
    intakeType: strOrNull(row.intake_type),
    firstItemName,
    fallback: `Receiving #${str(row.id)}`,
  });
  return {
    title,
    subtitle: subtitleOf([orderId, row.carrier, row.source_platform]),
    searchText: joinSearchText([
      row.tracking_number,
      row.carrier,
      row.po_number,
      row.source_order_id,
      row.source_platform,
      row.intake_type,
      row.exception_code,
      row.line_item_names,
      row.line_skus,
      row.support_notes,
      row.zoho_notes,
      row.qa_status,
    ]),
    facets: {
      status: strOrNull(row.qa_status),
      conditionGrade: strOrNull(row.condition_grade),
      sourcePlatform,
      trackingNumber: strOrNull(row.tracking_number),
      carrier: strOrNull(row.carrier),
      serialNumber: null,
      happenedAt: dateOrNull(row.received_at, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, sku, product_title, category, upc, ean, gtin, notes,
 *   lifecycle_status, is_active, created_at, updated_at,
 *   platform_skus / platform_item_ids / platform_accounts (LATERAL over
 *   sku_platform_ids — the ASIN, eBay item id and channel account a seller
 *   actually quotes), kit_part_names / kit_document_titles (LATERAL over
 *   sku_kit_parts — what is in the box and which insert ships with it),
 *   provider_item_id + item_name / item_sku / item_upc / item_ean (LEFT JOIN
 *   items on provider_item_id = zoho_item_id).
 *
 * The `items.*` fields are why there is no ITEM entity type. `items.id` is a
 * uuid and `entity_search_docs.entity_id` is BIGINT by law
 * (2026-07-03d:12-13), so the inventory-provider mirror cannot be its own
 * doc without widening that column for all nine types. It does not need to
 * be: an item is the provider's copy of a catalog row, and the ONE legal
 * join — `sku_catalog.provider_item_id = items.zoho_item_id`
 * (2026-07-22:23-27) — folds its identifiers into the SKU doc, which stays
 * keyed to the integer `sku_catalog.id`. NEVER joined on the SKU string:
 * `items.sku` and `sku_catalog.sku` are independent numbering schemes that
 * collide on the same strings (2026-07-22:5-9), which is also why
 * `item_sku` is indexed as a SEPARATE token from `sku` rather than assumed
 * to be the same value.
 */
function buildSkuDoc(row: SearchSourceRow): BuiltSearchDoc {
  const title = str(row.product_title) || str(row.item_name) || str(row.sku) || `SKU #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([row.sku, row.category]),
    searchText: joinSearchText([
      // Identifiers first: these are what staff paste in, and they must
      // survive the MAX_SEARCH_TEXT cap that free-text notes can breach.
      // The Zoho item number is the one an operator reads off the provider
      // UI or an invoice, so it rides with the internal SKU, not after prose.
      row.sku,
      row.item_sku,
      row.provider_item_id,
      row.platform_skus,
      row.platform_item_ids,
      row.upc,
      row.item_upc,
      row.ean,
      row.item_ean,
      row.gtin,
      row.product_title,
      row.item_name,
      row.category,
      row.platform_accounts,
      row.kit_part_names,
      row.kit_document_titles,
      row.lifecycle_status,
      row.notes,
    ]),
    facets: {
      status: strOrNull(row.lifecycle_status),
      conditionGrade: null,
      sourcePlatform: null,
      trackingNumber: null,
      carrier: null,
      serialNumber: null,
      happenedAt: dateOrNull(row.updated_at, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, ticket_number, product_title, serial_number, issue, notes, status,
 *   source_order_id, source_tracking_number, source_sku, received_at,
 *   created_at.
 */
function buildRepairDoc(row: SearchSourceRow): BuiltSearchDoc {
  const title = str(row.product_title) || `Repair #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([row.ticket_number, row.status]),
    searchText: joinSearchText([
      row.ticket_number,
      row.product_title,
      row.serial_number,
      row.issue,
      row.source_order_id,
      row.source_tracking_number,
      row.source_sku,
      row.status,
      row.notes,
    ]),
    facets: {
      status: strOrNull(row.status),
      conditionGrade: null,
      sourcePlatform: strOrNull(row.source_system),
      trackingNumber: null,
      carrier: null,
      serialNumber: strOrNull(row.serial_number),
      happenedAt: dateOrNull(row.received_at, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, shipment_ref, amazon_shipment_id, destination_fc, status, notes,
 *   due_date, shipped_at, created_at, item_titles, item_skus, item_fnskus,
 *   item_asins (STRING_AGGs over fba_shipment_items).
 */
function buildFbaDoc(row: SearchSourceRow): BuiltSearchDoc {
  const title = str(row.shipment_ref) || `FBA #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([row.status, row.destination_fc]),
    searchText: joinSearchText([
      row.shipment_ref,
      row.amazon_shipment_id,
      row.destination_fc,
      row.item_titles,
      row.item_skus,
      row.item_fnskus,
      row.item_asins,
      row.status,
      row.notes,
    ]),
    facets: {
      status: strOrNull(row.status),
      conditionGrade: null,
      sourcePlatform: 'fba',
      trackingNumber: null,
      carrier: null,
      serialNumber: null,
      happenedAt: dateOrNull(row.shipped_at, row.due_date, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, claim_number, serial_number, sku, product_title, source_system,
 *   source_order_id, source_tracking_number, zendesk_ticket_id, status,
 *   denial_reason_code, denial_notes (≤400), notes (≤600), created_at,
 *   customer_name / customer_email / customer_phone (LEFT JOIN customers on
 *   warranty_claims.customer_id).
 *
 * TITLE follows the REPAIR precedent: the product is what an operator
 * recognizes in a hit list, and an identifier-shaped title (`WC-2026-00042`)
 * would be crushed to its last 8 characters by `narrowSearchTitleDisplay`.
 * The claim number leads the SUBTITLE and the canonical text instead.
 */
function buildWarrantyClaimDoc(row: SearchSourceRow): BuiltSearchDoc {
  const claimNumber = str(row.claim_number);
  const title = str(row.product_title) || claimNumber || `Claim #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([claimNumber, row.customer_name, row.status]),
    searchText: joinSearchText([
      // Short high-selectivity identifiers first: a warranty call opens with
      // a claim number, a serial, or the marketplace order it shipped on, and
      // those must survive the MAX_SEARCH_TEXT cap that prose can breach.
      claimNumber,
      row.serial_number,
      row.source_order_id,
      row.source_tracking_number,
      row.sku,
      ...ticketTokens(row.zendesk_ticket_id),
      row.customer_name,
      row.customer_email,
      row.customer_phone,
      row.product_title,
      row.status,
      row.denial_reason_code,
      row.notes,
      row.denial_notes,
    ]),
    facets: {
      status: strOrNull(row.status),
      conditionGrade: null,
      sourcePlatform: strOrNull(row.source_system),
      // The claim's own denormalized outbound tracking — also what lets a
      // warranty hit open Journey Trace (journeyHandoffHref's default arm).
      trackingNumber: strOrNull(row.source_tracking_number),
      carrier: null,
      serialNumber: strOrNull(row.serial_number),
      // When the claim was LOGGED. warranty_expires_at is a countdown, not a
      // recency anchor, and delivered_at belongs to the shipment, not the claim.
      happenedAt: dateOrNull(row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, provider, external_ticket_id, subject_cache (≤400), status_cache,
 *   created_at, updated_at.
 *
 * Operators call `support_tickets.id` "the ticket number" (#42,
 * 2026-07-01f_support_tickets.sql:3) — so the PK is indexed as text in both
 * spellings, alongside the provider-native id they read off Zendesk.
 */
function buildSupportTicketDoc(row: SearchSourceRow): BuiltSearchDoc {
  const number = `#${str(row.id)}`;
  const title = str(row.subject_cache) || `Ticket ${number}`;
  return {
    title,
    subtitle: subtitleOf([number, row.status_cache]),
    searchText: joinSearchText([
      ...ticketTokens(row.id),
      ...ticketTokens(row.external_ticket_id),
      row.subject_cache,
      row.status_cache,
      row.provider,
    ]),
    facets: {
      status: strOrNull(row.status_cache),
      conditionGrade: null,
      sourcePlatform: strOrNull(row.provider),
      trackingNumber: null,
      carrier: null,
      serialNumber: null,
      happenedAt: dateOrNull(row.updated_at, row.created_at),
    },
  };
}

/**
 * Loader row contract:
 *   id, barcode, name, display_name, room, row_label, col_label, zone_letter,
 *   bin_type, bin_role, location_kind, is_active, locked_for_count,
 *   description (≤400), created_at, updated_at,
 *   content_skus (LEFT-bounded LATERAL over bin_contents).
 *
 * A bin is a record staff name out loud more often than almost anything else
 * ("it's in A-12-03") and the index could not return it. The BARCODE leads the
 * canonical text: it is what is printed on the label, scanned at the shelf and
 * typed into search — short, high-selectivity, and the one token that must
 * survive the MAX_SEARCH_TEXT cap.
 *
 * TITLE follows the display rule locations already carries
 * (schema.ts:3214-3218 — COALESCE(NULLIF(BTRIM(display_name),''), name)), so a
 * renamed bin reads as its nickname while `name` and `barcode` stay findable.
 */
function buildLocationDoc(row: SearchSourceRow): BuiltSearchDoc {
  const barcode = str(row.barcode);
  const title = str(row.display_name) || str(row.name) || barcode || `Bin #${str(row.id)}`;
  const isActive = row.is_active !== false;
  return {
    title,
    subtitle: subtitleOf([barcode, row.room, row.bin_role]),
    searchText: joinSearchText([
      barcode,
      row.name,
      row.display_name,
      row.room,
      row.row_label,
      row.col_label,
      row.zone_letter,
      row.bin_type,
      row.bin_role,
      row.location_kind,
      // Lifecycle as WORDS, not booleans: a deactivated or count-locked bin is
      // still scannable off an old label, so it stays indexed — but the state
      // has to be visible in the text an operator reads back.
      isActive ? null : 'INACTIVE',
      row.locked_for_count === true ? 'LOCKED FOR COUNT' : null,
      row.content_skus,
      row.description,
    ]),
    facets: {
      // The stored place vocabulary (BIN / ROOM / DESK / STAGING,
      // schema.ts:3232-3236) — a real column value, not a derived label.
      status: strOrNull(row.location_kind),
      conditionGrade: null,
      sourcePlatform: null,
      trackingNumber: null,
      carrier: null,
      serialNumber: null,
      happenedAt: dateOrNull(row.updated_at, row.created_at),
    },
  };
}

const BUILDERS: Record<SearchEntityType, (row: SearchSourceRow) => BuiltSearchDoc> = {
  ORDER: buildOrderDoc,
  SERIAL_UNIT: buildSerialUnitDoc,
  RECEIVING: buildReceivingDoc,
  SKU: buildSkuDoc,
  REPAIR: buildRepairDoc,
  FBA_SHIPMENT: buildFbaDoc,
  WARRANTY_CLAIM: buildWarrantyClaimDoc,
  SUPPORT_TICKET: buildSupportTicketDoc,
  LOCATION: buildLocationDoc,
};

export function buildSearchText(
  entityType: SearchEntityType,
  row: SearchSourceRow,
): BuiltSearchDoc {
  return BUILDERS[entityType](row);
}
