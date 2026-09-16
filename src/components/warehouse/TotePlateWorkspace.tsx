'use client';

/**
 * Inventory › Locations › Totes — bulk `H-{id}` plate runs from the desk.
 *
 * Consumes the `/m/print` tote SoT ({@link TotePrintRunFields}): New vs
 * Reprint, tote-count slider, copies left of Print. Total = totes × copies.
 *
 * Callers: LocationsWorkspace `?tab=totes`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  HandlingUnitLabelFacePreview,
} from '@/components/labels/HandlingUnitLabelFacePreview';
import { LABEL_BUILDER } from '@/components/barcode/label-builder-layout';
import {
  ToteCopiesPrintRow,
  TotePrintRunFields,
  type TotePrintMode,
} from '@/components/mobile/print/TotePrintRunFields';
import { printHandlingUnitLabelRun } from '@/lib/print/printLabelRun';
import { mintTotesForPrint, toteReprintFromTyped } from '@/lib/print/tote-mint-api';
import {
  DEFAULT_TOTE_COPIES_PER_SIDE,
  clampCopiesPerSide,
  clampToteCount,
  parseHouseToteId,
  platesPerTote,
  toteRunPlateCount,
} from '@/lib/print/labelCopies';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function TotePlateWorkspace() {
  const [mode, setMode] = useState<TotePrintMode>('new');
  const [count, setCount] = useState(10);
  const [copiesPerSide, setCopiesPerSide] = useState(DEFAULT_TOTE_COPIES_PER_SIDE);
  const [reprintCode, setReprintCode] = useState('');
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const totes = mode === 'reprint' ? 1 : clampToteCount(count);
  const total = toteRunPlateCount(totes, copiesPerSide);
  const reprintId = parseHouseToteId(reprintCode);
  const reprintReady = mode !== 'reprint' || reprintCode.trim().length > 0;

  const printLabel = useMemo(() => {
    if (mode === 'reprint') {
      return `Print ${total} plate${total === 1 ? '' : 's'}`;
    }
    return `Create + print ${total} plates`;
  }, [mode, total]);

  const run = useCallback(async () => {
    setPrinting(true);
    setProgress(null);
    try {
      const copies = platesPerTote(copiesPerSide);
      const result =
        mode === 'reprint'
          ? await printHandlingUnitLabelRun({
              copies,
              boxes: [toteReprintFromTyped(reprintCode)],
              onProgress: (done, totalN) => setProgress({ done, total: totalN }),
            })
          : await printHandlingUnitLabelRun({
              count: clampToteCount(count),
              copies,
              mint: mintTotesForPrint,
              onProgress: (done, totalN) => setProgress({ done, total: totalN }),
            });
      if (result.status === 'mint_failed') {
        toast.error(result.error || 'Could not create the totes — nothing printed');
        return;
      }
      if (result.status === 'skipped') {
        toast.error('Nothing to print');
        return;
      }
      toast.success(`Printed ${result.count} plate${result.count === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print tote labels');
    } finally {
      setPrinting(false);
      setProgress(null);
    }
  }, [mode, count, copiesPerSide, reprintCode]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex min-h-0 flex-1 flex-col', LABEL_BUILDER.stackGap, LABEL_BUILDER.pagePad)}>
        <div className={cn(LABEL_BUILDER.contentShell, 'flex flex-col gap-4')}>
          <TotePrintRunFields
            mode={mode}
            onMode={setMode}
            count={count}
            onCount={setCount}
            copiesPerSide={copiesPerSide}
            onCopiesPerSide={(n) => setCopiesPerSide(clampCopiesPerSide(n))}
            reprintCode={reprintCode}
            onReprintCode={setReprintCode}
            printing={printing}
          />

          <HandlingUnitLabelFacePreview
            fit="host"
            handlingUnitId={mode === 'reprint' ? reprintId : null}
            code={mode === 'reprint' && reprintId == null ? reprintCode.trim() || null : null}
          />

          <ToteCopiesPrintRow
            copiesPerSide={copiesPerSide}
            onCopiesPerSide={(n) => setCopiesPerSide(clampCopiesPerSide(n))}
            printLabel={printLabel}
            onPrint={() => void run()}
            printing={printing}
            printDisabled={!reprintReady}
          />

          {progress && (
            <p className="font-mono text-role-caption text-text-soft">
              Printing {progress.done}/{progress.total}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
