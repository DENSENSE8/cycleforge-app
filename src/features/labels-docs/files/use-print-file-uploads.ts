'use client';

/**
 * Labels & docs uploads (operator 2026-10-06): no type choice. Every picked
 * or dropped PDF is ONE file (`uploadPrintFile`); the server classifies each
 * page by its size (4×6-class → shipping label, Letter-class → paperwork) and
 * matches pages to orders silently. Files go one at a time, in pick order; a
 * second pick queues behind the first. Each file lands with a toast —
 * "<name> · 6 labels · 4 paperwork · 9 matched", or "already uploaded" — and
 * a row in the tray (`LabelUploadTray kind="files"`); every landing re-reads
 * the file list and the Orders view.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ORDER_PACKETS_KEY_ROOT } from '@/lib/label-prints/order-packets-client';
import { PRINT_FILES_KEY_ROOT, uploadPrintFile } from '@/lib/label-prints/print-files-client';
import { toast } from '@/lib/toast';
import type { LabelUploadItem, LabelUploads } from '../upload/use-label-uploads';
import { printFileUploadSummary } from './print-file-model';

export function usePrintFileUploads(): LabelUploads {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<LabelUploadItem[]>([]);
  const [running, setRunning] = useState(0);
  const nextKey = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const submit = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setRunning((count) => count + 1);
      queue.current = queue.current.then(async () => {
        try {
          for (const file of files) {
            const key = `file-upload-${(nextKey.current += 1)}`;
            const row: LabelUploadItem = { key, name: file.name, status: 'uploading', reason: null, batchId: null, summary: null };
            if (file.type && file.type !== 'application/pdf') {
              const reason = 'Not a PDF — uploads are PDFs.';
              setItems((current) => [...current, { ...row, status: 'failed', reason }]);
              toast.error(`${file.name} · ${reason}`);
              continue;
            }
            setItems((current) => [...current, row]);
            try {
              const result = await uploadPrintFile(file);
              const { tone, summary } = printFileUploadSummary(result);
              setItems((current) =>
                current.map((item) =>
                  item.key === key ? { ...item, status: result.duplicate ? 'replayed' : 'added', batchId: result.file.id, summary } : item,
                ),
              );
              toast[tone](`${file.name} · ${summary}`);
            } catch (error) {
              const reason = error instanceof Error ? error.message : 'Upload failed.';
              setItems((current) => current.map((item) => (item.key === key ? { ...item, status: 'failed', reason } : item)));
              toast.error(`${file.name} · ${reason}`);
            }
          }
        } finally {
          setRunning((count) => count - 1);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: PRINT_FILES_KEY_ROOT }),
            queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT }),
          ]);
        }
      });
    },
    [queryClient],
  );

  const clear = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading'));
  }, []);

  return { submit, items, clear, pending: running > 0 };
}
