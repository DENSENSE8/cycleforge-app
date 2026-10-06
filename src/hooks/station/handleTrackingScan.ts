import { scanDeskTracking } from '@/lib/picking/desk-scan-client';
import type { ScanHandlerContext } from './types';

interface TrackingCallbacks {
  onTrackingScan?: () => void;
  onTrackingOrderLoaded?: () => void;
}

export async function handleTrackingScan(
  input: string,
  ctx: ScanHandlerContext,
  callbacks: TrackingCallbacks = {},
): Promise<void> {
  const { onTrackingScan, onTrackingOrderLoaded } = callbacks;

  if (onTrackingScan) onTrackingScan();
  ctx.setIsLoading(true);

  try {
    // Armed bench → place on that desk; no arm → plain tracking (order load +
    // serials). Placement is earned by arming, never required to scan.
    const result = await scanDeskTracking(input, {
      idempotencyKey: ctx.newIdempotencyKey(),
      packLocationId: ctx.getArmedPackLocationId?.() ?? null,
    });

    if (!result.ok) {
      ctx.setErrorMessage(result.error);
      ctx.syncActiveOrderState(null);
      ctx.clearManuals();
      return;
    }
    const { data } = result;

    ctx.syncActiveOrderState(result.order);
    if (data.packPlacement) {
      void ctx.queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] });
      void ctx.queryClient.invalidateQueries({ queryKey: ['orders', 'queue-counts'] });
    }

    // Exception sessions are amber-card honesty — never a success flash that
    // reads as "order loaded" (Station §6 / CF-02). Matched orders may whisper.
    if (result.message) {
      ctx.setSuccessMessage(result.message);
      void ctx.resolveManual(data.order.sku, data.order.itemNumber ?? null);
    } else {
      ctx.clearManuals();
    }

    onTrackingOrderLoaded?.();

    // Surgical cache insert — avoids full invalidation for same-tab scans. The
    // record carries the identity `GET /api/picking/desk/logs` gives this scan
    // (`id` = its station_activity_logs row, `order_db_id` = the matched order),
    // so the server echo replaces it in place. Any other id is a second row the
    // echo throws away, and the scan drops off the Recent rail. An exception
    // scan's payload is `buildOrderPayload(null)`, so the same mapping reads it.
    const salId = Number(data.salId ?? data.techActivityId);
    if (Number.isFinite(salId) && salId > 0) {
      window.dispatchEvent(new CustomEvent('tech-log-added', {
        detail: {
          id: salId,
          source_row_id: salId,
          source_kind: 'tech_scan',
          tech_serial_id: null,
          order_db_id: data.order.id ?? null,
          shipment_id: data.order.shipmentId ?? null,
          created_at: data.order.testDateTime ?? null,
          shipping_tracking_number: data.order.tracking ?? '',
          serial_number: '',
          tested_by: data.order.testedBy ?? null,
          order_id: data.order.orderId !== 'N/A' && data.order.orderId !== '—' ? data.order.orderId : null, // ds-allow-na: scan payload empty reader
          product_title: data.order.productTitle ?? null,
          item_number: data.order.itemNumber ?? null,
          sku: data.order.sku !== 'N/A' && data.order.sku !== '—' ? data.order.sku : null, // ds-allow-na: scan payload empty reader
          condition: data.order.condition !== 'N/A' && data.order.condition !== '—' ? data.order.condition : null, // ds-allow-na: scan payload empty reader
          status: data.order.status ?? null,
          status_history: data.order.statusHistory ?? [],
          notes: data.order.notes ?? null,
          account_source: data.order.accountSource ?? null,
          quantity: String(data.order.quantity || '1'),
          is_shipped: data.order.isShipped ?? false,
          ship_by_date: data.order.shipByDate ?? null,
          is_out_of_stock: false,
        },
      }));
    }

    ctx.triggerGlobalRefresh();
  } catch (err) {
    console.error('Tracking scan failed:', err);
    ctx.setErrorMessage('Failed to load order. Please try again.');
  } finally {
    ctx.setIsLoading(false);
    ctx.setInputValue('');
    ctx.inputRef.current?.focus();
  }
}
