'use client';

/**
 * An order slot's label intake: every picked or dropped PDF is uploaded as
 * labels only (`stock=label` — the server lands each page as a label and
 * applies nothing itself), then every page is filed on THIS order. The same
 * file uploaded again is the same file (its print history carries over).
 * Uploads run one at a time, in pick order; a second pick queues behind the
 * first.
 */

import { useCallback, useRef, useState } from 'react';
import { fetchLabelBatch, uploadLabelBatch } from '@/lib/label-batches/http-client';
import { fileLabelOnOrderHttp } from '@/lib/label-ingestions/http-client';

export type UploadStatus = 'uploading' | 'added' | 'replayed' | 'failed';

export interface LabelUploadItem {
  key: string;
  /** The file the operator picked. */
  name: string;
  status: UploadStatus;
  /** Why a `failed` row failed, or which pages did not land. */
  reason: string | null;
  /** The file it became (or already was). */
  batchId: number | null;
  /** "2 labels · 2 paired to 113-…" once it lands. */
  summary: string | null;
}

export interface LabelUploads {
  /** Queue files (PDFs; anything else lands as a failed row). */
  submit(files: File[]): void;
  items: LabelUploadItem[];
  /** Dismiss the tray: finished rows go; rows still sending stay until they land. */
  clear(): void;
  /** A pick is still sending. */
  pending: boolean;
}

/** `onSettled` runs after each pick's last upload lands — the slot refreshes its packet there. */
export function useLabelUploads({
  onSettled,
  targetOrderId,
  targetOrderRef,
}: {
  onSettled?: () => void | Promise<void>;
  /** Every uploaded page is filed onto this exact order. */
  targetOrderId: number;
  targetOrderRef?: string;
}): LabelUploads {
  const [items, setItems] = useState<LabelUploadItem[]>([]);
  const [running, setRunning] = useState(0);
  const nextKey = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const patch = useCallback((key: string, next: Partial<LabelUploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const submit = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setRunning((count) => count + 1);
      queue.current = queue.current.then(async () => {
        try {
          for (const file of files) {
            const key = `upload-${(nextKey.current += 1)}`;
            const row: LabelUploadItem = { key, name: file.name, status: 'uploading', reason: null, batchId: null, summary: null };
            if (file.type && file.type !== 'application/pdf') {
              setItems((current) => [...current, { ...row, status: 'failed', reason: 'Not a PDF — label uploads are PDFs.' }]);
              continue;
            }
            setItems((current) => [...current, row]);
            try {
              const result = await uploadLabelBatch(file);
              const detail = await fetchLabelBatch(result.file.id);
              let pairedPages = 0;
              for (const page of detail.pages) {
                if (page.state === 'APPLIED') {
                  if (page.orderId !== targetOrderId) {
                    throw new Error(`Page ${page.pageNumber} is already applied to another order.`);
                  }
                  pairedPages += 1;
                  continue;
                }
                if (page.orderId == null && !page.trackingNumber) {
                  throw new Error(`Page ${page.pageNumber} has no readable tracking number and cannot be paired.`);
                }
                await fileLabelOnOrderHttp({ id: page.id, rowVersion: page.rowVersion, matchedOrderId: page.orderId }, targetOrderId).catch(
                  (error: unknown) => {
                    throw new Error(`Page ${page.pageNumber}: ${error instanceof Error ? error.message : 'not filed.'}`);
                  },
                );
                pairedPages += 1;
              }
              const { labelPages } = result.file;
              const failed = result.failedPages;
              patch(key, {
                status: result.duplicate ? 'replayed' : 'added',
                batchId: result.file.id,
                summary: `${labelPages} label${labelPages === 1 ? '' : 's'} · ${pairedPages} paired to ${targetOrderRef || `order ${targetOrderId}`}`,
                reason: failed.length > 0 ? `${failed.length} page(s) failed — p${failed[0]!.pageNumber}: ${failed[0]!.reason}` : null,
              });
            } catch (error) {
              patch(key, { status: 'failed', reason: error instanceof Error ? error.message : 'Upload failed.' });
            }
          }
        } finally {
          setRunning((count) => count - 1);
          await settled.current?.();
        }
      });
    },
    [patch, targetOrderId, targetOrderRef],
  );

  const clear = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading'));
  }, []);

  return { submit, items, clear, pending: running > 0 };
}
