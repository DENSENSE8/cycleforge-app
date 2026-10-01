import { productImageUrl } from '@/lib/photos/product-image-url';
import { cartonReadHref } from '@/lib/receiving/surface-path';
import { formatSearchSel } from '@/lib/search/search-selection';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import {
  stationFeedSourceRank,
  type StationFeedItem,
  type StationFeedJob,
  type StationFeedOutcome,
  type StationFeedSort,
} from './types';

export const STATION_FEED_ACTIVITY_JOB: Readonly<Record<string, Exclude<StationFeedJob, 'identify'>>> = {
  ARRIVAL_SCANNED: 'arrival',
  UNBOX_COMPLETED: 'unbox',
  PICK_SCANNED: 'pick',
  SERIAL_ADDED: 'pick',
  QC_RESULT_RECORDED: 'quality_control',
  PACK_COMPLETED: 'pack',
  PACK_SCAN: 'pack',
  SHIP_CONFIRM: 'scan_out',
  PACK_SHIPPED: 'scan_out',
};

export const STATION_FEED_ACTIVITY_TYPES = Object.freeze(Object.keys(STATION_FEED_ACTIVITY_JOB));

export const STATION_FEED_OPS_EVENT_JOB: Readonly<Record<string, 'arrival' | 'unbox'>> = {
  'receiving.carton.arrived': 'arrival',
  UNBOX_CONFIRMED: 'unbox',
};

export const STATION_FEED_OPS_EVENT_TYPES = Object.freeze(Object.keys(STATION_FEED_OPS_EVENT_JOB));

export interface StationActivityFeedRow {
  id: number | string;
  created_at: string | Date;
  station: string | null;
  activity_type: string;
  staff_id: number | string | null;
  staff_name: string | null;
  avatar_photo_id: number | string | null;
  shipment_id: number | string | null;
  scan_ref: string | null;
  fnsku: string | null;
  notes: string | null;
  metadata: unknown;
  order_row_id: number | string | null;
  order_id: string | null;
  order_status: string | null;
  order_sku: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  order_product_title: string | null;
  catalog_image_url: string | null;
  listing_cover_photo_id: number | string | null;
}

export interface MobileScanFeedRow {
  id: number | string;
  created_at: string | Date;
  staff_id: number | string;
  staff_name: string | null;
  avatar_photo_id: number | string | null;
  raw_value: string;
  normalized: string | null;
  kind: string;
  match_outcome: 'single' | 'multi' | 'none' | string;
  routed_to: string | null;
  matched_order_id: string | null;
  order_row_id: number | string | null;
  order_id: string | null;
  order_status: string | null;
  order_sku: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  order_product_title: string | null;
  catalog_image_url: string | null;
  listing_cover_photo_id: number | string | null;
}

export interface OpsEventFeedRow {
  id: number | string;
  occurred_at: string | Date;
  event_type: string;
  entity_type: string;
  entity_id: number | string;
  actor_staff_id: number | string | null;
  staff_name: string | null;
  avatar_photo_id: number | string | null;
  workflow_node_id: string | null;
  payload: unknown;
}

type Metadata = Record<string, unknown>;

function metadataOf(value: unknown): Metadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Metadata;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Metadata : {};
  } catch {
    return {};
  }
}

function positiveInt(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function safeHref(value: unknown): string | null {
  const href = text(value);
  return href?.startsWith('/') ? href : null;
}

function occurredAt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function actor(row: {
  staff_id: number | string | null;
  staff_name: string | null;
  avatar_photo_id: number | string | null;
}) {
  const staffId = positiveInt(row.staff_id);
  if (staffId == null) return null;
  return {
    staffId,
    name: text(row.staff_name) ?? `Staff ${staffId}`,
    avatarPhotoId: positiveInt(row.avatar_photo_id),
  };
}

function orderIdentity(row: {
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  order_product_title: string | null;
  order_sku: string | null;
  catalog_image_url: string | null;
  listing_cover_photo_id: number | string | null;
}) {
  return {
    title: resolveSkuIdentityTitle({
      catalog_product_title: row.catalog_product_title,
      zoho_item_title: row.zoho_item_title,
      item_name: row.order_product_title,
      sku: row.order_sku,
    }),
    imageUrl: productImageUrl({
      catalogImageUrl: row.catalog_image_url,
      listingCoverPhotoId: positiveInt(row.listing_cover_photo_id),
    }),
  };
}

function activityOutcome(job: Exclude<StationFeedJob, 'identify'>, metadata: Metadata): StationFeedOutcome {
  if (text(metadata.outcome) === 'needs_attention') return 'needs_attention';
  if (job === 'quality_control' && metadata.passed === false) return 'needs_attention';
  return 'committed';
}

function activitySubject(row: StationActivityFeedRow, job: Exclude<StationFeedJob, 'identify'>, metadata: Metadata) {
  const explicitType = text(metadata.subject_entity_type);
  const explicitId = text(metadata.subject_id);
  const explicitTitle = text(metadata.subject_title);
  const explicitIdentifier = text(metadata.subject_identifier);
  const explicitHref = safeHref(metadata.subject_href);
  const identity = orderIdentity(row);
  const orderRowId = positiveInt(row.order_row_id) ?? positiveInt(metadata.order_row_id);
  const canonicalHref =
    explicitHref
    ?? ((explicitType === 'order' || explicitType === 'shipment') && orderRowId != null
      ? shippingOrdersHref({ openOrderId: orderRowId })
      : explicitType === 'receiving' && positiveInt(explicitId) != null
        ? cartonReadHref(positiveInt(explicitId)!)
        : explicitType === 'unit' && positiveInt(explicitId) != null
          ? `/search?sel=${encodeURIComponent(formatSearchSel('unit', positiveInt(explicitId)!))}`
          : null);

  if (explicitType && explicitId) {
    return {
      entityType: (['scan', 'receiving', 'order', 'unit', 'shipment'].includes(explicitType)
        ? explicitType
        : 'scan') as StationFeedItem['subject']['entityType'],
      id: explicitId,
      title:
        (explicitType === 'order' || explicitType === 'shipment') && identity.title
          ? identity.title
          : explicitTitle ?? explicitIdentifier ?? explicitId,
      identifier: explicitIdentifier,
      imageUrl: identity.imageUrl,
      status: text(metadata.subject_status) ?? row.order_status,
      href: canonicalHref,
    };
  }

  const receivingId = positiveInt(metadata.receiving_id);
  if ((job === 'arrival' || job === 'unbox') && receivingId != null) {
    return {
      entityType: 'receiving' as const,
      id: String(receivingId),
      title: `Carton ${receivingId}`,
      identifier: text(row.scan_ref) ?? text(metadata.tracking),
      imageUrl: null,
      status: text(metadata.subject_status),
      href: cartonReadHref(receivingId),
    };
  }

  const serialUnitId = positiveInt(metadata.serial_unit_id);
  if (job === 'quality_control' && serialUnitId != null) {
    const identifier = text(metadata.serial_number) ?? text(metadata.sku);
    return {
      entityType: 'unit' as const,
      id: String(serialUnitId),
      title: explicitTitle ?? identifier ?? `Unit ${serialUnitId}`,
      identifier,
      imageUrl: text(metadata.image_url),
      status: text(metadata.subject_status),
      href: `/search?sel=${encodeURIComponent(formatSearchSel('unit', serialUnitId))}`,
    };
  }

  if (orderRowId != null) {
    const identifier = text(row.order_id) ?? text(metadata.order_id) ?? String(orderRowId);
    return {
      entityType: 'order' as const,
      id: String(orderRowId),
      title: identity.title || `Order ${identifier}`,
      identifier,
      imageUrl: identity.imageUrl,
      status: row.order_status ?? text(metadata.subject_status),
      href: shippingOrdersHref({ openOrderId: orderRowId }),
    };
  }

  const shipmentId = positiveInt(row.shipment_id);
  return {
    entityType: shipmentId != null ? 'shipment' as const : 'scan' as const,
    id: String(shipmentId ?? row.id),
    title: explicitTitle ?? text(row.notes) ?? (shipmentId != null ? `Shipment ${shipmentId}` : 'Station activity'),
    identifier: text(row.scan_ref) ?? text(row.fnsku),
    imageUrl: identity.imageUrl,
    status: text(metadata.subject_status),
    href: explicitHref,
  };
}

const JOB_VERB: Readonly<Record<Exclude<StationFeedJob, 'identify'>, string>> = {
  arrival: 'Scanned arrival',
  unbox: 'Completed unbox',
  pick: 'Picked',
  quality_control: 'Recorded quality control',
  pack: 'Packed',
  scan_out: 'Scanned out',
};

export function mapStationActivityRow(row: StationActivityFeedRow): StationFeedItem | null {
  const job = STATION_FEED_ACTIVITY_JOB[row.activity_type];
  const sourceId = positiveInt(row.id);
  const rowActor = actor(row);
  if (!job || sourceId == null || !rowActor) return null;
  const metadata = metadataOf(row.metadata);
  const subject = activitySubject(row, job, metadata);
  const outcome = activityOutcome(job, metadata);
  const verdict = job === 'quality_control' ? (metadata.passed === false ? 'failed' : metadata.passed === true ? 'passed' : null) : null;
  return {
    id: `sal:${sourceId}`,
    source: 'station_activity_log',
    sourceId,
    occurredAt: occurredAt(row.created_at),
    job,
    outcome,
    actor: rowActor,
    context: {
      origin: 'phone',
      surface: text(metadata.surface) ?? '/m',
      station: text(row.station),
      workflowNodeId: text(metadata.workflow_node_id),
    },
    subject,
    message: text(metadata.message) ?? `${JOB_VERB[job]}${verdict ? ` (${verdict})` : ''}: ${subject.identifier ?? subject.title}`,
  };
}

export function mapOpsEventRow(row: OpsEventFeedRow): StationFeedItem | null {
  const job = STATION_FEED_OPS_EVENT_JOB[row.event_type];
  const sourceId = positiveInt(row.id);
  const rowActor = actor({
    staff_id: row.actor_staff_id,
    staff_name: row.staff_name,
    avatar_photo_id: row.avatar_photo_id,
  });
  const metadata = metadataOf(row.payload);
  const receivingId = positiveInt(row.entity_id) ?? positiveInt(metadata.receiving_id) ?? positiveInt(metadata.receivingId);
  if (!job || sourceId == null || !rowActor || row.entity_type !== 'receiving' || receivingId == null) return null;
  const identifier = text(metadata.subject_identifier) ?? text(metadata.trackingNumber) ?? text(metadata.tracking);
  const title = text(metadata.subject_title) ?? `Carton ${receivingId}`;
  return {
    id: `ops:${sourceId}`,
    source: 'ops_event',
    sourceId,
    occurredAt: occurredAt(row.occurred_at),
    job,
    outcome: 'committed',
    actor: rowActor,
    context: {
      origin: 'phone',
      surface: text(metadata.surface) ?? (job === 'arrival' ? '/m/scan' : `/m/r/${receivingId}`),
      station: 'RECEIVING',
      workflowNodeId: text(row.workflow_node_id),
    },
    subject: {
      entityType: 'receiving',
      id: String(receivingId),
      title,
      identifier,
      imageUrl: null,
      status: text(metadata.subject_status),
      href: cartonReadHref(receivingId),
    },
    message: text(metadata.message) ?? `${JOB_VERB[job]}: ${identifier ?? title}`,
  };
}

export function mapMobileScanRow(row: MobileScanFeedRow): StationFeedItem | null {
  const sourceId = positiveInt(row.id);
  const rowActor = actor(row);
  if (sourceId == null || !rowActor) return null;
  const orderRowId = positiveInt(row.order_row_id);
  const identity = orderIdentity(row);
  const identifier = text(row.order_id) ?? text(row.normalized) ?? text(row.raw_value) ?? String(sourceId);
  const subject = orderRowId != null
    ? {
        entityType: 'order' as const,
        id: String(orderRowId),
        title: identity.title || `Order ${identifier}`,
        identifier,
        imageUrl: identity.imageUrl,
        status: row.order_status,
        href: shippingOrdersHref({ openOrderId: orderRowId }),
      }
    : {
        entityType: 'scan' as const,
        id: String(sourceId),
        title: identifier,
        identifier: text(row.raw_value),
        imageUrl: null,
        status: row.match_outcome,
        href: safeHref(row.routed_to),
      };
  const needsAttention = row.match_outcome !== 'single';
  return {
    id: `mse:${sourceId}`,
    source: 'mobile_scan_event',
    sourceId,
    occurredAt: occurredAt(row.created_at),
    job: 'identify',
    outcome: needsAttention ? 'needs_attention' : 'identified',
    actor: rowActor,
    context: { origin: 'phone', surface: '/m/scan', station: null, workflowNodeId: null },
    subject,
    message: needsAttention
      ? `Identification needs attention: ${identifier}`
      : `Identified: ${identifier}`,
  };
}

export function compareStationFeedItems(a: StationFeedItem, b: StationFeedItem, sort: StationFeedSort): number {
  const time = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (time !== 0) return sort === 'newest' ? -time : time;
  const aRank = stationFeedSourceRank(a.source);
  const bRank = stationFeedSourceRank(b.source);
  if (aRank !== bRank) return aRank - bRank;
  return sort === 'newest' ? b.sourceId - a.sourceId : a.sourceId - b.sourceId;
}

/** Merge pages/realtime catch-up without ever showing the resolver row behind a correlated commit. */
export function mergeStationFeedItems(
  current: readonly StationFeedItem[],
  incoming: readonly StationFeedItem[],
  sort: StationFeedSort,
): StationFeedItem[] {
  const byId = new Map<string, StationFeedItem>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => compareStationFeedItems(a, b, sort));
}
