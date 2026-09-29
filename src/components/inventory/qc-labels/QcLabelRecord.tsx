'use client';

/**
 * Inventory › QC labels — the open label, on the order record's shape (owner
 * 2026-09-28, `remake-in-style`), and the Print form. The list is
 * `QcLabelsLedger` (one-row triage); these are what its record plane holds.
 */

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Printer } from '@/components/Icons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordPhoto } from '@/design-system/components/record-ledger/IndustrialRecord';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { EVIDENCE_CONTROL_CLASS, EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_FACT_KEY_CLASS, RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { QC_LABEL_LIFECYCLE } from '@/design-system/tokens/qc-label-lifecycle';
import { qcLabelHandle, qcLabelStage, type QcLabelRow, type QcLabelStage } from '@/lib/labels/qc-label-row';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { toast } from '@/lib/toast';
import { conditionLabel } from '@/lib/conditions';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { cn } from '@/utils/_cn';

/** Fact rows inside a group — the carton record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** The record body on the stage canvas — its groups lift as cards. */
export const RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0';

/** Where the labelled unit goes next in the outbound loop (none once it rests or ships). */
export const QC_LABEL_NEXT: Readonly<Partial<Record<QcLabelStage, string>>> = {
  allocated: 'Pick',
  picked: 'Pack',
};

interface PrintableUnit {
  serial_unit_id: number;
  unit_uid: string | null;
  serial_number: string | null;
  sku: string | null;
  title: string;
  condition_grade: string | null;
  printed: boolean;
}

export function stamp(iso: string | null, pattern = 'MMM d, yyyy · h:mm a'): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : format(at, pattern);
}

/** Print one unit's QC label and record the sticker (`label_print_jobs`). */
async function printQcLabel(unit: PrintableUnit): Promise<void> {
  const handle = qcLabelHandle(unit);
  printProductLabel({
    sku: unit.sku ?? '',
    title: unit.title,
    serialNumber: unit.serial_number ?? undefined,
    qrPayload: handle,
    condition: unit.condition_grade,
  });
  const res = await fetch('/api/label-print-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobs: [
        {
          jobType: unit.printed ? 'REPRINT' : 'UNIT',
          serialUnitId: unit.serial_unit_id,
          unitUid: unit.unit_uid,
          qrPayload: handle,
          templateId: 'product',
          isReprint: unit.printed,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Printed, but the print record failed (${res.status})`);
}
/** The label's ONE status, top-right of the record header: where the unit is in the outbound loop, and what comes next. */
export function QcLabelRecordStatus({ row }: { row: QcLabelRow }) {
  const stage = qcLabelStage(row);
  const state = QC_LABEL_LIFECYCLE[stage];
  const next = QC_LABEL_NEXT[stage] ?? null;
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="qc-label-record-status">
      <LifecycleCode state={state} />
      {next ? (
        <span className={cn(RECORD_LABEL_CLASS, 'hidden truncate text-mode-muted @md/record-head:inline')} data-testid="qc-label-record-next">
          {next}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The open label, on the order record's shape (owner 2026-09-28,
 * `remake-in-style`): left, the work — the Item (identity only), the Label
 * (Reprint top-right), Quality control; right, the facts — Location, Outbound.
 */
export function QcLabelEvidence({ row, onPrinted }: { row: QcLabelRow; onPrinted: () => void }) {
  const [busy, setBusy] = useState(false);
  const reprint = async () => {
    setBusy(true);
    try {
      await printQcLabel({ ...row, printed: true });
      toast.success(`Reprinting ${qcLabelHandle(row)}`);
      onPrinted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reprint failed');
    } finally {
      setBusy(false);
    }
  };
  const onOrder = row.order_id != null;

  const main = (
    <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
      <RecordGroup title="Item" titleHidden testId="qc-label-record-item">
        <article aria-label={row.title} className="flex gap-3 px-4 py-3">
          <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-mode-control border border-mode-frame bg-mode-well">
            <RecordPhoto src={null} fallback={row.title} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 min-w-0 text-role-body font-bold" title={row.title}>
              {row.title}
            </p>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-role-data">
              <span>
                <span className={RECORD_FACT_KEY_CLASS}>SN </span>
                <span className={cn(RECORD_ID_CLASS, 'select-all text-mode-ink')}>{row.serial_number ?? '—'}</span>
              </span>
              <span>
                <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
                <span className={cn(RECORD_ID_CLASS, 'select-all text-mode-ink')}>{row.sku ?? '—'}</span>
              </span>
              <span>
                <span className={RECORD_FACT_KEY_CLASS}>Condition </span>
                <span className="text-mode-ink">{row.condition_grade ? conditionLabel(row.condition_grade) : '—'}</span>
              </span>
            </p>
          </div>
        </article>
      </RecordGroup>
      <RecordGroup
        title="Label"
        testId="qc-label-record-label"
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<Printer aria-hidden />}
            loading={busy}
            onClick={() => void reprint()}
            data-testid="qc-label-reprint"
          >
            Reprint
          </Button>
        }
      >
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Unit id">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{qcLabelHandle(row)}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Printed">
            {stamp(row.first_printed_at) ?? '—'}
            {row.print_count <= 1 && row.last_printed_by_name ? ` · ${row.last_printed_by_name}` : ''}
          </EvidenceFactRow>
          {row.print_count > 1 ? (
            <EvidenceFactRow label="Reprinted">
              {row.print_count - 1}×, last {stamp(row.last_printed_at) ?? '—'}
              {row.last_printed_by_name ? ` · ${row.last_printed_by_name}` : ''}
            </EvidenceFactRow>
          ) : null}
        </div>
      </RecordGroup>
      <RecordGroup title="Quality control" testId="qc-label-record-qc">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Tested by">{row.tested_by_name ?? '—'}</EvidenceFactRow>
          <EvidenceFactRow label="Tested">{stamp(row.tested_at) ?? '—'}</EvidenceFactRow>
        </div>
      </RecordGroup>
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
      <RecordGroup title="Location" testId="qc-label-record-location">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Bin">
            <span className={cn(RECORD_ID_CLASS, !row.location && 'text-mode-warn')}>{row.location ?? 'No location'}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Unit status">{sentenceCaseLabel(row.current_status)}</EvidenceFactRow>
        </div>
      </RecordGroup>
      <RecordGroup title="Outbound" testId="qc-label-record-outbound">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="Order">
            {onOrder ? (
              <Link className="underline underline-offset-2" href={`/shipping/orders?openOrderId=${row.order_id}`}>
                #{row.order_label ?? row.order_id}
              </Link>
            ) : (
              <span className="text-mode-muted">Not on an order</span>
            )}
          </EvidenceFactRow>
          {onOrder ? (
            <>
              <EvidenceFactRow label="Allocation">{row.allocation_state ? sentenceCaseLabel(row.allocation_state) : '—'}</EvidenceFactRow>
              {/* Held for the order, serial not bound yet: the pick scan of THIS label closes the loop. */}
              <EvidenceFactRow label="Serial">
                {row.serial_on_order ? 'On the order' : <span className="text-mode-warn">Joins the order when the picker scans this label</span>}
              </EvidenceFactRow>
            </>
          ) : null}
        </div>
      </RecordGroup>
    </div>
  );

  return (
    <div className={RECORD_ROOT_CLASS} data-testid="qc-label-evidence">
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
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
      const res = await fetch(`/api/inventory/qc-labels/unit?scan=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; unit?: PrintableUnit; error?: string } | null;
      if (!res.ok || !json?.unit) {
        setError(json?.error ?? `Lookup failed (${res.status})`);
        return;
      }
      await printQcLabel(json.unit);
      toast.success(`${json.unit.printed ? 'Reprinting' : 'Printing'} ${qcLabelHandle(json.unit)}`);
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
          <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
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
