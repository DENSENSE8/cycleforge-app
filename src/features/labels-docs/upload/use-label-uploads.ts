'use client';

/**
 * Label PDF intake for the desk: every picked or dropped PDF is one BATCH
 * (owner 2026-09-28) — the server splits it into one label per page, keeps the
 * pages together under the file, and answers what landed. The same file
 * uploaded again is the same batch (its print history carries over). Uploads
 * run one at a time, in pick order; a second pick queues behind the first.
 */

import { useCallback, useRef, useState } from 'react';
import { uploadLabelBatch } from '@/lib/label-batches/http-client';
import type { LabelBatchRow } from '@/lib/label-batches/contracts';

export type UploadStatus = 'uploading' | 'added' | 'replayed' | 'failed';

export interface LabelUploadItem {
  key: string;
  /** The file the operator picked. */
  name: string;
  status: UploadStatus;
  /** Why a `failed` row failed, or which pages did not land. */
  reason: string | null;
  /** The batch the file became (or already was). */
  batchId: number | null;
  /** "38 labels added · 2 already on file" once it lands. */
  summary: string | null;
}

/** "38 labels added · 31 paired · 5 to confirm · 2 unpaired" — what landed, and where each page went. */
function pagesSummary(added: number, alreadyOnFile: number, batch: LabelBatchRow, replayed: boolean): string {
  const { pageCount, pairedPages, confirmPages } = batch;
  const parts = replayed
    ? [`Already uploaded · ${pageCount} label${pageCount === 1 ? '' : 's'}`]
    : [`${added} label${added === 1 ? '' : 's'} added`, ...(alreadyOnFile > 0 ? [`${alreadyOnFile} already on file`] : [])];
  parts.push(`${pairedPages} paired`);
  if (confirmPages > 0) parts.push(`${confirmPages} to confirm`);
  const unpaired = pageCount - pairedPages - confirmPages;
  if (unpaired > 0) parts.push(`${unpaired} unpaired`);
  return parts.join(' · ');
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

/**
 * `onSettled` runs after each pick's last upload lands — the desk refreshes its
 * queue there; `onUploaded` hears each landed batch (the Uploads view opens it).
 */
export function useLabelUploads({
  onSettled,
  onUploaded,
}: { onSettled?: () => void | Promise<void>; onUploaded?: (batchId: number) => void } = {}): LabelUploads {
  const [items, setItems] = useState<LabelUploadItem[]>([]);
  const [running, setRunning] = useState(0);
  const nextKey = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;

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
              const { added, alreadyOnFile, failed } = result.pages;
              patch(key, {
                status: result.replayed ? 'replayed' : 'added',
                batchId: result.batch.id,
                summary: pagesSummary(added, alreadyOnFile, result.batch, result.replayed),
                reason: failed.length > 0 ? `${failed.length} page(s) failed — p${failed[0]!.pageNumber}: ${failed[0]!.reason}` : null,
              });
              uploaded.current?.(result.batch.id);
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
    [patch],
  );

  const clear = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading'));
  }, []);

  return { submit, items, clear, pending: running > 0 };
}
