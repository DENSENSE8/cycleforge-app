'use client';

/**
 * Label PDF intake for the desk: every picked or dropped file becomes one
 * tray row per LABEL. A carrier batch export (one PDF, many pages) is split
 * with `pdf-lib` into single-page PDFs named `<base>-p<n>.pdf`, each sent
 * through `uploadLabelPdf` on its own — so the server pairs, dedupes and
 * prints them one label at a time. A single-page PDF uploads byte-for-byte
 * unchanged. Uploads run one at a time, in pick order; a second pick while
 * the first is still sending queues behind it.
 */

import { PDFDocument } from 'pdf-lib';
import { useCallback, useRef, useState } from 'react';
import { uploadLabelPdf } from '@/lib/label-ingestions/http-client';

export type UploadStatus = 'uploading' | 'added' | 'replayed' | 'failed';

export interface LabelUploadItem {
  key: string;
  /** The file sent (`<base>-p<n>.pdf` for a split page). */
  name: string;
  /** The file the operator picked. */
  sourceName: string;
  /** 1-based page of a split batch; null when the file went up whole. */
  page: number | null;
  status: UploadStatus;
  /** Why a `failed` row failed. */
  reason: string | null;
}

/** One file per page of `file`; the file itself when it has one page or pdf-lib cannot read it (the server then judges it). */
async function splitPages(file: File): Promise<Array<{ file: File; page: number | null }>> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  } catch {
    return [{ file, page: null }];
  }
  const count = source.getPageCount();
  if (count <= 1) return [{ file, page: null }];
  const base = file.name.replace(/\.pdf$/i, '');
  const pages: Array<{ file: File; page: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [index]);
    single.addPage(copied!);
    const bytes = (await single.save()) as Uint8Array<ArrayBuffer>;
    pages.push({ file: new File([bytes], `${base}-p${index + 1}.pdf`, { type: 'application/pdf' }), page: index + 1 });
  }
  return pages;
}

export interface LabelUploads {
  /** Queue files (PDFs; anything else lands as a failed row). */
  submit(files: File[]): void;
  items: LabelUploadItem[];
  /** Dismiss the tray: finished rows go; rows still sending stay until they land. */
  clear(): void;
  /** A pick is still splitting or sending. */
  pending: boolean;
}

/** `onSettled` runs after each pick's last upload lands — the desk refreshes its queue there. */
export function useLabelUploads({ onSettled }: { onSettled?: () => void | Promise<void> } = {}): LabelUploads {
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
            if (file.type && file.type !== 'application/pdf') {
              const key = `upload-${(nextKey.current += 1)}`;
              setItems((current) => [
                ...current,
                { key, name: file.name, sourceName: file.name, page: null, status: 'failed', reason: 'Not a PDF — label uploads are PDFs.' },
              ]);
              continue;
            }
            let parts: Array<{ file: File; page: number | null }>;
            try {
              parts = await splitPages(file);
            } catch (error) {
              const key = `upload-${(nextKey.current += 1)}`;
              const reason = error instanceof Error ? error.message : 'Could not split the PDF.';
              setItems((current) => [...current, { key, name: file.name, sourceName: file.name, page: null, status: 'failed', reason }]);
              continue;
            }
            const rows = parts.map(({ file: part, page }) => ({
              part,
              item: {
                key: `upload-${(nextKey.current += 1)}`,
                name: part.name,
                sourceName: file.name,
                page,
                status: 'uploading' as const,
                reason: null,
              },
            }));
            setItems((current) => [...current, ...rows.map((row) => row.item)]);
            for (const { part, item } of rows) {
              try {
                const result = await uploadLabelPdf(part);
                patch(item.key, { status: result.replayed ? 'replayed' : 'added' });
              } catch (error) {
                patch(item.key, { status: 'failed', reason: error instanceof Error ? error.message : 'Upload failed.' });
              }
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
