'use client';

/** Paste (or drop) an orders capture onto the To-ship desk and it stages. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  classifyPastedText,
  pasteDraftFileName,
  stagingRowsFromExtractedOrders,
  type ExtractedOrderRow,
} from '@/lib/orders/import/paste-intake';
import type { CapturedOrder } from '@/lib/orders/import/order-text-parse';
import { loadTableImportDraft } from '@/lib/tables/import/staging-store';
import { isTableImportLive } from '@/lib/tables/import/registry';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { blobToBase64DataUrl, downscaleImageTo720 } from '@/lib/image/downscale';
import { toast } from '@/lib/toast';

/** The one mouth's identity hook — {@link StationComposerHost} `data-testid`. */
const MOUTH_SELECTOR = '[data-testid="station-composer-host"]';
/** The inline intake entry — {@link OrderIntakeEntry} `data-testid`. */
const INTAKE_SELECTOR = '[data-testid="order-intake-entry"]';
/** Pages of one list, at most — the route's cap. */
const MAX_CAPTURE_IMAGES = 6;

type PasteScope = 'mouth' | 'desk' | 'other';

function isEditable(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

/** Where did the paste land? Exported for the unit test; pure DOM. */
function pasteScopeFor(target: EventTarget | null): PasteScope {
  if (!(target instanceof Element)) return 'desk';
  if (target.closest(MOUTH_SELECTOR)) return 'mouth';
  if (isEditable(target)) return 'other';
  return 'desk';
}

function imageFilesFrom(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  return Array.from(transfer.files).filter((f) => f.type.startsWith('image/'));
}

type CaptureResponse =
  | {
      success: true;
      orders: Array<{
        order_number: string;
        platform: string;
        item_title: string;
        item_number: string;
        sku: string;
        quantity: string;
        customer_name: string;
        ship_by_date: string;
        tracking_number: string;
      }>;
      captured: CapturedOrder[];
    }
  | { success: false; error?: string };

/**
 * Read a pasted order — text, or screenshots (downscaled to 720) — through
 * `/api/orders/import/extract-capture`. Shared by the desk's paste staging and
 * the intake form's "Paste an order"; nothing is created.
 */
export async function requestOrderCapture(input: { text: string } | { files: File[] }): Promise<{
  rows: ExtractedOrderRow[];
  captured: CapturedOrder[];
}> {
  let body: { text: string } | { image_data_urls: string[] };
  if ('text' in input) {
    body = { text: input.text };
  } else {
    const image_data_urls: string[] = [];
    for (const file of input.files.slice(0, MAX_CAPTURE_IMAGES)) {
      const scaled = await downscaleImageTo720(file);
      image_data_urls.push(await blobToBase64DataUrl(scaled.blob));
    }
    body = { image_data_urls };
  }
  const res = await fetch('/api/orders/import/extract-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as CaptureResponse | null;
  if (!res.ok || !data || !data.success) {
    throw new Error((data && !data.success && data.error) || `Extract failed (${res.status})`);
  }
  return {
    rows: data.orders.map((o) => ({
      orderNumber: o.order_number,
      platform: o.platform,
      itemTitle: o.item_title,
      itemNumber: o.item_number,
      sku: o.sku,
      quantity: o.quantity,
      customerName: o.customer_name,
      shipByDate: o.ship_by_date,
      trackingNumber: o.tracking_number,
    })),
    captured: data.captured,
  };
}

interface OrderPasteIntakeState {
  /** A capture is being read by the model. */
  extracting: boolean;
}

export function useOrderPasteIntake(): OrderPasteIntakeState {
  const { setActive } = useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const [extracting, setExtracting] = useState(false);
  const busy = useRef(false);
  const live = isTableImportLive(ORDER_IMPORT_DESCRIPTOR.surfaceId);

  const stage = useCallback(
    (input: { fileName: string; headers: string[]; rows: Record<string, string>[] }) => {
      const outcome = loadTableImportDraft(ORDER_IMPORT_DESCRIPTOR, input);
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      setActive(true);
      const noun = input.rows.length === 1 ? 'row' : 'rows';
      toast.success(`Staged ${input.rows.length} ${noun} from ${input.fileName}`);
    },
    [setActive],
  );

  const stageImages = useCallback(
    async (files: File[]) => {
      if (busy.current) return;
      busy.current = true;
      setExtracting(true);
      try {
        const { rows: orders } = await requestOrderCapture({ files });
        if (orders.length === 0) {
          toast.error('No order lines could be read from that screenshot.');
          return;
        }
        const { headers, rows } = stagingRowsFromExtractedOrders(orders);
        stage({ fileName: pasteDraftFileName('capture', rows.length), headers, rows });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Extract failed');
      } finally {
        busy.current = false;
        setExtracting(false);
      }
    },
    [stage],
  );

  useEffect(() => {
    if (!live) return;

    const onPaste = (e: ClipboardEvent) => {
      // The intake form reads its own pastes (it fills fields for review).
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest(INTAKE_SELECTOR))) return;
      const scope = pasteScopeFor(e.target);
      if (scope === 'other') return;

      const images = imageFilesFrom(e.clipboardData);
      if (images.length > 0) {
        e.preventDefault();
        void stageImages(images);
        return;
      }

      const text = e.clipboardData?.getData('text/plain') ?? '';
      const classified = classifyPastedText(text);
      if (classified.kind !== 'csv') return;
      // A CSV must not flood the mouth's textarea; on the bare desk there is
      // nothing to flood, but the outcome is the same draft either way.
      e.preventDefault();
      stage({
        fileName: pasteDraftFileName('csv', classified.rows.length),
        headers: classified.headers,
        rows: classified.rows,
      });
    };

    // Drop is the same intake with a different gesture — only onto the mouth,
    // and only for image files. `dragover` must be cancelled for `drop` to
    // fire at all; cancel it only when we would actually take the drop.
    const onDragOver = (e: DragEvent) => {
      if (pasteScopeFor(e.target) !== 'mouth') return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (pasteScopeFor(e.target) !== 'mouth') return;
      const images = imageFilesFrom(e.dataTransfer);
      if (images.length === 0) return;
      e.preventDefault();
      void stageImages(images);
    };

    document.addEventListener('paste', onPaste);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [live, stage, stageImages]);

  return { extracting };
}
