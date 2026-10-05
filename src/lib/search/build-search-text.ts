/** buildSearchText — canonical denormalized text + display fields + facets for one entity_search_docs row (AI search Phase 0,… */

import {
  receivingOrderIdFromParts,
  receivingSearchTitle,
} from '@/lib/search/receiving-search-title';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

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
  /**
   * product_brands.id of the doc's SKU brand node (a leaf — may be a
   * product_line such as Wave under Bose), only when the catalog brand is a
   * fact (brand_confidence >= 0.90). SKU: its own; ORDER / SERIAL_UNIT /
   * RECEIVING: the carried SKU's. Powers `axis=brand` and the brand facet.
   */
  brandId: number | null;
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

/** A positive integer id, or null (pg returns int columns as numbers, bigint as strings). */
function idOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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

/** Ticket-number tokens. */
function ticketTokens(value: unknown): string[] {
  const bare = str(value).replace(/^#+/, '');
  return bare ? [`#${bare}`, bare] : [];
}

/** Loader row contract (worker SQL): */
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
      // The carried SKU's brand name, ancestors and aliases — "bose" finds
      // a Wave order. Short, so it rides ahead of the serial lists.
      row.brand_text,
      row.serials,
      // Serials bound through `order_unit_allocations` — the modern path.
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
      brandId: idOrNull(row.brand_id),
    },
  };
}

/** Loader row contract: */
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
      row.brand_text,
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
      brandId: idOrNull(row.brand_id),
    },
  };
}

/** Loader row contract: */
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
      // Every line's SKU brand, not only the first line's.
      row.brand_text,
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
      brandId: idOrNull(row.brand_id),
    },
  };
}

/** Loader row contract: */
function buildSkuDoc(row: SearchSourceRow): BuiltSearchDoc {
  // THE SKU IDENTITY LAW: the Zoho item name governs; the marketplace-owned
  // catalog title is only the no-Zoho-twin fallback.
  const title =
    resolveSkuIdentityTitle({
      zoho_item_title: strOrNull(row.zoho_item_title),
      catalog_product_title: strOrNull(row.product_title),
      sku: strOrNull(row.sku),
      zoho_item_id: strOrNull(row.zoho_item_id),
    }) || `SKU #${str(row.id)}`;
  return {
    title,
    subtitle: subtitleOf([row.sku, row.category]),
    searchText: joinSearchText([
      // Identifiers first:
      row.sku,
      row.provider_item_id,
      row.zoho_item_id,
      row.platform_skus,
      row.platform_item_ids,
      row.upc,
      row.item_upc,
      row.ean,
      row.item_ean,
      row.gtin,
      row.zoho_item_title,
      row.product_title,
      // Brand: Zoho's own brand word, then the catalog fact brand's name,
      // ancestors and aliases — short, so ahead of the prose that can hit
      // the cap.
      row.zoho_item_brand,
      row.brand_text,
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
      brandId: idOrNull(row.brand_id),
    },
  };
}

/** Loader row contract: */
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
      brandId: null,
    },
  };
}

/** Loader row contract: */
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
      brandId: null,
    },
  };
}

/** Loader row contract: */
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
      brandId: null,
    },
  };
}

/** Space-separated loader aggregate → its tokens. */
function words(value: unknown): string[] {
  return str(value).split(/\s+/).filter(Boolean);
}

/**
 * Loader row contract: support_tickets (+ lifecycle, requester, account) and
 * the aggregates LOADER_SQL.SUPPORT_TICKET joins — linked orders (numbers,
 * ids, SKUs, tracking), repairs (ids, ticket numbers, source order / SKU /
 * tracking), linked shipments' tracking, ticket items' SKUs, pasted external
 * references. Short identifiers lead so they survive MAX_SEARCH_TEXT.
 */
function buildSupportTicketDoc(row: SearchSourceRow): BuiltSearchDoc {
  const number = `#${str(row.id)}`;
  const title = str(row.subject_cache) || `Ticket ${number}`;
  // Local lifecycle is the truth; the provider status is mirror metadata.
  const status = strOrNull(row.lifecycle) ?? strOrNull(row.status_cache);
  const requester = str(row.requester_name) || str(row.requester_email) || str(row.requester_handle);
  const trackings = [...words(row.order_trackings), ...words(row.shipment_trackings), ...words(row.repair_trackings)];
  return {
    title,
    subtitle: subtitleOf([number, requester, status]),
    searchText: joinSearchText([
      ...ticketTokens(row.id),
      ...ticketTokens(row.external_ticket_id),
      row.requester_email,
      row.requester_handle,
      row.requester_name,
      row.order_numbers,
      row.order_ids,
      row.repair_order_numbers,
      ...words(row.repair_ids).map((id) => `RS-${id}`),
      row.repair_numbers,
      trackings.join(' '),
      row.order_skus,
      row.repair_skus,
      row.item_skus,
      row.external_refs,
      row.subject_cache,
      row.account_label,
      status,
      row.status_cache,
      row.provider,
    ]),
    facets: {
      status,
      conditionGrade: null,
      sourcePlatform: strOrNull(row.provider),
      trackingNumber: trackings[0] ?? null,
      carrier: null,
      serialNumber: null,
      happenedAt: dateOrNull(row.updated_at, row.created_at),
      brandId: null,
    },
  };
}

/** Loader row contract: */
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
      brandId: null,
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
