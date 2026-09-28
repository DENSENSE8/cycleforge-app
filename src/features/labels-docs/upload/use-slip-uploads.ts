'use client';

/**
 * Packing-slip intake for the desk: picked files land in a REVIEW tray, never
 * straight onto an order. Each file is matched to one of the desk's orders
 * (`matchSlipFile`: filename, then its pdf.js text); the operator picks the
 * order for an unmatched or ambiguous file, or removes the row. Confirm all
 * files every row through the order's own slip write
 * (`uploadOrderDocument` → `/api/orders/:id/documents/upload`) — the same
 * write the order record's paperwork card makes.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { loadPdfjs, PDFJS_STANDARD_FONT_DATA_URL } from '@/lib/manuals/pdfThumbnail';
import { orderDocumentsKey, uploadOrderDocument } from '@/lib/orders/order-paperwork-client';
import { matchSlipFile, type SlipCandidate, type SlipMatch } from './slip-matching';

/** Slips are rarely longer than this; an order number past page 4 is not the slip's header. */
const TEXT_PAGE_LIMIT = 4;

export type SlipRowStatus = 'reading' | 'review' | 'uploading' | 'filed' | 'failed';

export interface SlipUploadRow {
  key: string;
  file: File;
  status: SlipRowStatus;
  /** What the file names on its own; null while reading or when it names nothing. */
  match: SlipMatch;
  /** The order this row files onto: the operator's pick, else a single match; null = not yet decided. */
  orderId: number | null;
  /** Why a `failed` row failed. */
  reason: string | null;
}

interface SlipRowState {
  key: string;
  file: File;
  status: SlipRowStatus;
  /** pdf.js page text; '' for an image or an unreadable PDF; null while reading. */
  text: string | null;
  /** undefined = follow the match; null = operator cleared it; a number = operator's pick. */
  pick: number | null | undefined;
  reason: string | null;
}

/** The PDF's page text, space-joined — the same glyph setup the desk prints with (`label-raster.ts`). */
async function readSlipText(file: File): Promise<string> {
  if (file.type && file.type !== 'application/pdf') return '';
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
    disableFontFace: true,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, TEXT_PAGE_LIMIT); n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages.join('\n');
  } catch {
    return '';
  } finally {
    task.destroy().catch(() => {});
  }
}

export interface SlipUploads {
  /** Add files to the review tray (PDFs are read for their order number; images match by filename). */
  submit(files: File[]): void;
  rows: SlipUploadRow[];
  /** Pick (a number) or clear (null) the order a row files onto. */
  assign(key: string, orderId: number | null): void;
  /** Drop a row; nothing is filed for it. */
  remove(key: string): void;
  /** File every row not yet filed onto its order. */
  confirm(): Promise<void>;
  /** Dismiss the tray. Nothing is filed by dismissing; a confirm in flight is not interrupted. */
  clear(): void;
  /** Every unfiled row has an order and none is still being read. */
  canConfirm: boolean;
  /** Confirm all is filing. */
  pending: boolean;
}

/**
 * @param candidates the orders a slip may file onto (the desk's paired orders).
 * @param opts.onSettled runs after Confirm all lands (every row filed or failed).
 */
export function useSlipUploads(
  candidates: ReadonlyArray<SlipCandidate>,
  { onSettled }: { onSettled?: () => void | Promise<void> } = {},
): SlipUploads {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SlipRowState[]>([]);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  const nextKey = useRef(0);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const patch = useCallback((key: string, next: Partial<SlipRowState>) => {
    setState((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
  }, []);

  const submit = useCallback(
    (files: File[]) => {
      const added = files.map((file) => ({
        key: `slip-${(nextKey.current += 1)}`,
        file,
        status: 'reading' as const,
        text: null,
        pick: undefined,
        reason: null,
      }));
      setState((current) => [...current, ...added]);
      for (const row of added) {
        void readSlipText(row.file)
          .catch(() => '')
          .then((text) => patch(row.key, { text, status: 'review' }));
      }
    },
    [patch],
  );

  const rows = useMemo<SlipUploadRow[]>(
    () =>
      state.map((row) => {
        const match = row.text === null ? null : matchSlipFile({ filename: row.file.name, text: row.text }, candidates);
        const matched = match && 'orderId' in match ? match.orderId : null;
        return {
          key: row.key,
          file: row.file,
          status: row.status,
          match,
          orderId: row.pick === undefined ? matched : row.pick,
          reason: row.reason,
        };
      }),
    [state, candidates],
  );

  const assign = useCallback((key: string, orderId: number | null) => patch(key, { pick: orderId }), [patch]);

  const remove = useCallback((key: string) => {
    setState((current) => current.filter((row) => row.key !== key));
  }, []);

  const open = rows.filter((row) => row.status !== 'filed');
  const canConfirm =
    !confirming && open.length > 0 && open.every((row) => row.status !== 'reading' && row.orderId !== null);

  const confirm = useCallback(async () => {
    if (!canConfirm || confirmingRef.current) return;
    setConfirming(true);
    confirmingRef.current = true;
    const refOf = new Map(candidates.map((candidate) => [candidate.orderId, candidate.orderRef]));
    const touched = new Set<number>();
    try {
      for (const row of open) {
        const orderId = row.orderId!;
        patch(row.key, { status: 'uploading', reason: null });
        try {
          await uploadOrderDocument(orderId, refOf.get(orderId) ?? String(orderId), 'packing_slip', row.file);
          touched.add(orderId);
          patch(row.key, { status: 'filed' });
        } catch (error) {
          patch(row.key, { status: 'failed', reason: error instanceof Error ? error.message : 'Upload failed.' });
        }
      }
    } finally {
      for (const orderId of touched) void queryClient.invalidateQueries({ queryKey: orderDocumentsKey(orderId) });
      setConfirming(false);
      confirmingRef.current = false;
      await settled.current?.();
    }
  }, [canConfirm, candidates, open, patch, queryClient]);

  const clear = useCallback(() => {
    if (!confirmingRef.current) setState([]);
  }, []);

  return { submit, rows, assign, remove, confirm, clear, canConfirm, pending: confirming };
}
