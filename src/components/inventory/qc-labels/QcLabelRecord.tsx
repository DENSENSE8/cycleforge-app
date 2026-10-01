'use client';

/**
 * Inventory › QC labels — the Print form, and the open unit's Reprint verb.
 * The list is `QcLabelsLedger` (one-row triage); the open unit is the shared
 * QC unit record (`useQcUnitRecord` → `RecordView`).
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { Printer } from '@/components/Icons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EVIDENCE_CONTROL_CLASS, EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import type { RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { Button } from '@/design-system/primitives';
import { qcLabelHandle, type QcLabelRow, type QcLabelStage } from '@/lib/labels/qc-label-row';
import { fetchQcLabelPrintUnit, printQcLabel } from '@/lib/print/printQcLabel';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** The record body on the stage canvas — its groups lift as cards. */
export const RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** Where the labelled unit goes next in the outbound loop (none once it rests or ships). */
export const QC_LABEL_NEXT: Readonly<Partial<Record<QcLabelStage, string>>> = {
  allocated: 'Pick',
  picked: 'Pack',
};

export function stamp(iso: string | null, pattern = 'MMM d, yyyy · h:mm a'): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, pattern);
}

/** The open unit's header Reprint: its QC label again, one more `label_print_jobs` row. */
export function qcLabelReprintVerb(row: QcLabelRow, onPrinted: () => void): RecordVerb {
  return {
    id: 'reprint',
    label: 'Reprint',
    icon: <Printer aria-hidden />,
    run: async () => {
      try {
        await printQcLabel({ ...row, printed: true });
        toast.success(`Reprinting ${qcLabelHandle(row)}`);
        onPrinted();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Reprint failed');
      }
    },
  };
}

export function QcLabelPrintForm({ onPrinted }: { onPrinted: () => void }) {
  const [scan, setScan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const value = scan.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const unit = await fetchQcLabelPrintUnit(value);
      if (typeof unit === 'string') {
        setError(unit);
        return;
      }
      await printQcLabel(unit);
      toast.success(`${unit.printed ? 'Reprinting' : 'Printing'} ${qcLabelHandle(unit)}`);
      setScan('');
      onPrinted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={RECORD_ROOT_CLASS} data-testid="qc-label-print-form">
      <DeskRecordLayout
        main={
          <div className="flex min-w-0 flex-col gap-4">
            {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
            <RecordGroup
              title="Scan the unit's serial or its old label"
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Printer aria-hidden />}
                  loading={busy}
                  disabled={!scan.trim()}
                  onClick={() => void submit()}
                  data-testid="qc-label-print"
                >
                  Print
                </Button>
              }
            >
              <div className="px-4 pb-3">
                <input
                  autoFocus
                  value={scan}
                  onChange={(event) => setScan(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="Serial, unit id or scanned label"
                  aria-label="Serial, unit id or scanned label"
                  className={cn(EVIDENCE_CONTROL_CLASS, 'w-full font-mono')}
                  data-testid="qc-label-print-scan"
                />
              </div>
            </RecordGroup>
          </div>
        }
      />
    </div>
  );
}
