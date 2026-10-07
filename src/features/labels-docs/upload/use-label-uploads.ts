'use client';

/**
 * An order slot's label intake: every picked or dropped PDF is uploaded as
 * labels only (`stock=label` — the server lands each page as a label and
 * applies nothing itself), then every page is checked (`file-check`) and filed
 * on THIS order (`file-on-order`). A page that needs the operator — no
 * tracking read, its tracking on another order, or this order already on a
 * different tracking — waits in the tray with its question while the rest of
 * the file files; one page never fails the batch. The same file uploaded again
 * is the same file (its print history carries over). Uploads run one at a
 * time, in pick order; a second pick queues behind the first.
 */

import { useCallback, useRef, useState } from 'react';
import { fetchLabelBatch, uploadLabelBatch } from '@/lib/label-batches/http-client';
import type { LabelBatchPage } from '@/lib/label-batches/contracts';
import { labelFilingNeeds, type LabelFilingAnswers } from '@/lib/label-ingestions/file-on-order-contracts';
import {
  fetchLabelFileCheck,
  fileLabelOnOrderHttp,
  LabelFilingAnswerRequired,
  type LabelFileCheck,
  type LabelFilingQuestion,
} from '@/lib/label-ingestions/http-client';

export type UploadStatus = 'uploading' | 'waiting' | 'added' | 'replayed' | 'failed';

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
  /** Dismiss the tray: finished rows go; rows still sending or waiting on an answer stay. */
  clear(): void;
  /** A pick is still sending. */
  pending: boolean;
}

/** The operator's answer for one page: the filing answers plus a typed tracking number. */
export type LabelPageAnswer = LabelFilingAnswers & { tracking?: string };

/** One uploaded page waiting on the operator before it files. */
export interface WaitingLabelPage {
  key: string;
  /** The tray row (file) it came from. */
  itemKey: string;
  fileName: string;
  batchId: number;
  pageNumber: number;
  label: { id: number; rowVersion: number; matchedOrderId: number | null };
  check: LabelFileCheck;
  needs: LabelFilingQuestion[];
  /** Answers given so far — a typed tracking stays while the next question is asked. */
  answers: LabelPageAnswer;
  busy: boolean;
  error: string | null;
}

/** An order slot's uploads: the file rows plus the pages waiting on an answer. */
export interface LabelPageUploads extends LabelUploads {
  waiting: WaitingLabelPage[];
  /** Answer one waiting page (merged with its earlier answers) and file it; a further question keeps it waiting. */
  answer(key: string, answer: LabelPageAnswer): void;
  /** Leave the page unfiled — it stays with the unpaired labels. */
  cancel(key: string): void;
}

/** Per file: what its pages came to, so the row's face can be re-told as waiting pages settle. */
interface FileTally {
  labelPages: number;
  duplicate: boolean;
  filed: number;
  alreadyOnOrder: number[];
  failures: string[];
}

const pageLabel = (page: LabelBatchPage) => ({ id: page.id, rowVersion: page.rowVersion, matchedOrderId: page.orderId });
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** `onSettled` runs after each pick's last upload lands, and after a waiting page files — the slot refreshes its packet there. */
export function useLabelUploads({
  onSettled,
  targetOrderId,
  targetOrderRef,
}: {
  onSettled?: () => void | Promise<void>;
  /** Every uploaded page is filed onto this exact order. */
  targetOrderId: number;
  targetOrderRef?: string;
}): LabelPageUploads {
  const [items, setItems] = useState<LabelUploadItem[]>([]);
  const [waiting, setWaitingState] = useState<WaitingLabelPage[]>([]);
  const [running, setRunning] = useState(0);
  const nextKey = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const waitingRef = useRef<WaitingLabelPage[]>([]);
  const tallies = useRef(new Map<string, FileTally>());
  const orderName = targetOrderRef || `order ${targetOrderId}`;

  const patch = useCallback((key: string, next: Partial<LabelUploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const setWaiting = useCallback((update: (current: WaitingLabelPage[]) => WaitingLabelPage[]) => {
    waitingRef.current = update(waitingRef.current);
    setWaitingState(waitingRef.current);
  }, []);

  /** Re-tell one file row from its tally and its pages still waiting. */
  const retell = useCallback(
    (itemKey: string) => {
      const tally = tallies.current.get(itemKey);
      if (!tally) return;
      const open = waitingRef.current.filter((page) => page.itemKey === itemKey).length;
      const { labelPages, filed, alreadyOnOrder, failures } = tally;
      const parts = [`${labelPages} label${labelPages === 1 ? '' : 's'} · ${filed} paired to ${orderName}`];
      if (open > 0) parts.push(`${open} waiting on you`);
      if (alreadyOnOrder.length > 0) parts.push(`${alreadyOnOrder.map((n) => `p${n}`).join(', ')} already on this order`);
      patch(itemKey, {
        status: open > 0 ? 'waiting' : labelPages > 0 && failures.length >= labelPages ? 'failed' : tally.duplicate ? 'replayed' : 'added',
        summary: parts.join(' · '),
        reason: failures.length > 0 ? failures.join(' · ') : null,
      });
    },
    [orderName, patch],
  );

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
              const tally: FileTally = {
                labelPages: result.file.labelPages,
                duplicate: result.duplicate,
                filed: 0,
                alreadyOnOrder: [],
                failures: result.failedPages.map((page) => `p${page.pageNumber}: ${page.reason}`),
              };
              tallies.current.set(key, tally);
              patch(key, { batchId: result.file.id });
              const asks: WaitingLabelPage[] = [];
              for (const page of detail.pages) {
                if (page.state === 'APPLIED') {
                  if (page.orderId === targetOrderId) tally.filed += 1;
                  else tally.failures.push(`p${page.pageNumber}: already filed on ${page.orderRef ?? 'another order'} — unpair it there first`);
                  continue;
                }
                const ask = (check: LabelFileCheck, needs: LabelFilingQuestion[]) =>
                  asks.push({ key: `${key}:${page.id}`, itemKey: key, fileName: file.name, batchId: result.file.id, pageNumber: page.pageNumber, label: pageLabel(page), check, needs, answers: {}, busy: false, error: null });
                try {
                  const check = await fetchLabelFileCheck(page.id, { orderId: targetOrderId });
                  const needs = labelFilingNeeds(check);
                  if (needs.length > 0) {
                    ask(check, needs);
                    continue;
                  }
                  await fileLabelOnOrderHttp(pageLabel(page), targetOrderId);
                  tally.filed += 1;
                  if (check.sameAlready) tally.alreadyOnOrder.push(page.pageNumber);
                } catch (error) {
                  if (error instanceof LabelFilingAnswerRequired) ask(error.check, error.needs);
                  else tally.failures.push(`p${page.pageNumber}: ${errorText(error, 'not filed.')}`);
                }
              }
              if (asks.length > 0) setWaiting((current) => [...current, ...asks]);
              retell(key);
            } catch (error) {
              patch(key, { status: 'failed', reason: errorText(error, 'Upload failed.') });
            }
          }
        } finally {
          setRunning((count) => count - 1);
          await settled.current?.();
        }
      });
    },
    [patch, retell, setWaiting, targetOrderId],
  );

  const answer = useCallback(
    (key: string, given: LabelPageAnswer) => {
      const page = waitingRef.current.find((entry) => entry.key === key);
      if (!page || page.busy) return;
      const answers = { ...page.answers, ...given };
      const update = (next: Partial<WaitingLabelPage>) =>
        setWaiting((current) => current.map((entry) => (entry.key === key ? { ...entry, ...next } : entry)));
      const settle = async () => {
        setWaiting((current) => current.filter((entry) => entry.key !== key));
        const tally = tallies.current.get(page.itemKey);
        if (tally) {
          tally.filed += 1;
          if (page.check.sameAlready) tally.alreadyOnOrder.push(page.pageNumber);
        }
        retell(page.itemKey);
        await settled.current?.();
      };
      update({ busy: true, error: null, answers });
      void (async () => {
        try {
          await fileLabelOnOrderHttp(page.label, targetOrderId, answers);
          await settle();
        } catch (error) {
          if (error instanceof LabelFilingAnswerRequired) {
            update({ busy: false, check: error.check, needs: error.needs });
            return;
          }
          // A write may have landed part-way (typed tracking, the confirm): re-read the page's row version.
          const fresh = await fetchLabelBatch(page.batchId)
            .then((detail) => detail.pages.find((entry) => entry.id === page.label.id) ?? null)
            .catch(() => null);
          if (fresh?.state === 'APPLIED' && fresh.orderId === targetOrderId) {
            await settle();
            return;
          }
          update({ busy: false, error: errorText(error, 'Not filed.'), label: fresh ? pageLabel(fresh) : page.label });
        }
      })();
    },
    [retell, setWaiting, targetOrderId],
  );

  const cancel = useCallback(
    (key: string) => {
      const page = waitingRef.current.find((entry) => entry.key === key);
      if (!page || page.busy) return;
      setWaiting((current) => current.filter((entry) => entry.key !== key));
      tallies.current.get(page.itemKey)?.failures.push(`p${page.pageNumber}: left unfiled, with the unpaired labels`);
      retell(page.itemKey);
    },
    [retell, setWaiting],
  );

  const clear = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading' || item.status === 'waiting'));
  }, []);

  return { submit, items, clear, pending: running > 0, waiting, answer, cancel };
}
