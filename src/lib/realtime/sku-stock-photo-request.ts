/**
 * Desktop → phone stock-photo capture over the `staffstation:{staffId}` bridge
 * channel — the `sku_stock` twin of `receiving-photo-request.ts`. The phone
 * opens `/m/stock/{stockId}/photos` and uploads `SKU_STOCK` primary links; the
 * server then announces `sku-stock-photo.changed` on the org station channel
 * so the desk record repaints.
 */

import { getStaffStationBridgeChannelName, safeChannelName } from './channels';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** Desk → phone: open the camera for one `sku_stock` row. */
export const SKU_STOCK_PHOTO_REQUEST_EVENT = 'sku_stock_photo_request';

/** Server → every surface (station channel): a `sku_stock` row's photos changed. */
export const SKU_STOCK_PHOTO_CHANGED_EVENT = 'sku-stock-photo.changed';

interface SkuStockPhotoRequestClient {
  channels: {
    get: (name: string) => {
      publish: (event: string, data: Record<string, unknown>) => Promise<void>;
    };
  };
}

/** Parsed request as the phone sees it. */
export interface SkuStockPhotoRequest {
  stockId: number;
  sku: string | null;
  requestId: string | null;
}

export function getSkuStockPhotoRequestChannelName(
  orgId: string | null | undefined,
  staffId: number,
): string {
  if (!orgId || staffId <= 0) return '';
  return safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId));
}

function validStockId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function publishSkuStockPhotoRequest(
  client: SkuStockPhotoRequestClient | null,
  orgId: string | null | undefined,
  staffId: number,
  stockId: number,
  opts: { sku?: string | null; requestId?: string } = {},
): Promise<void> {
  const channelName = getSkuStockPhotoRequestChannelName(orgId, staffId);
  if (!client || !channelName || validStockId(stockId) == null) return;
  const sku = String(opts.sku ?? '').trim();
  await client.channels.get(channelName).publish(SKU_STOCK_PHOTO_REQUEST_EVENT, {
    stock_id: stockId,
    ...(sku ? { sku } : {}),
    request_id: opts.requestId || safeRandomUUID(),
    requested_by_staff_id: staffId,
  });
}

/** Phone side: the wire payload → a request, or `null` when it names no stock row. */
export function parseSkuStockPhotoRequest(data: unknown): SkuStockPhotoRequest | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as { stock_id?: unknown; sku?: unknown; request_id?: unknown };
  const stockId = validStockId(raw.stock_id);
  if (stockId == null) return null;
  const sku = String(raw.sku ?? '').trim();
  const requestId = String(raw.request_id ?? '').trim();
  return { stockId, sku: sku || null, requestId: requestId || null };
}

/** The phone capture route for one stock row. */
export function skuStockPhotoCaptureHref(
  request: SkuStockPhotoRequest,
  backHref?: string | null,
): string {
  const qs = new URLSearchParams();
  if (request.sku) qs.set('sku', request.sku);
  if (backHref) qs.set('back', backHref);
  const suffix = qs.toString();
  return `/m/stock/${request.stockId}/photos${suffix ? `?${suffix}` : ''}`;
}
