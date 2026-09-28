'use client';

/**
 * Inventory › **QC labels** — one record per serial unit carrying a printed QC
 * / pre-box label (template `product`). The sticker's DataMatrix is the unit's
 * `unit_uid` (else `U-{serial}`); the picker scans it and the pick binds that
 * serial to the order (`linkPickedSerialToOrder`), which the record shows as
 * "Serial on order". Print = a unit's label, from a scan or a typed serial;
 * Reprint = the open record's label. Every sticker is a `label_print_jobs` row.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Printer } from '@/components/Icons';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import {
  IndustrialRecord,
  RecordBin,
  RecordIdFact,
  RecordNext,
  RecordPhoto,
  RecordStamp,
  RecordStateCode,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceDecisionBar,
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  EvidenceTitle,
} from '@/design-system/components/record-ledger/RecordEvidence';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RECORD_LOCATION_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { QC_LABEL_LIFECYCLE } from '@/design-system/tokens/qc-label-lifecycle';
import { qcLabelHandle, qcLabelStage, type QcLabelRow } from '@/lib/labels/qc-label-row';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { toast } from '@/lib/toast';
import { conditionLabel } from '@/lib/conditions';
import { cn } from '@/utils/_cn';

/** Record key while the record plane holds the Print form. */
const PRINT_KEY = 'print-qc-label';

interface PrintableUnit {
  serial_unit_id: number;
  unit_uid: string | null;
  serial_number: string | null;
  sku: string | null;
  title: string;
  condition_grade: string | null;
  printed: boolean;
}

function stamp(iso: string | null, pattern = 'MMM d, yyyy · h:mm a'): string | null {
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

export function QcLabelsLedger({ rows, totalCount, capped }: { rows: QcLabelRow[]; totalCount: number; capped: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [printing, setPrinting] = useState(false);

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${QC_LABELS_PATH}?${qs}` : QC_LABELS_PATH, { scroll: false });
    },
    [router, searchParams],
  );

  const openKey = searchParams.get('open')?.trim() || null;
  const openRecord = useMemo(
    () => (openKey ? (rows.find((row) => String(row.serial_unit_id) === openKey) ?? null) : null),
    [openKey, rows],
  );
  const openRecordKey = useCallback(
    (key: string) => {
      setPrinting(false);
      replace((params) => params.set('open', key));
    },
    [replace],
  );
  const closeRecord = useCallback(() => {
    setPrinting(false);
    replace((params) => params.delete('open'));
  }, [replace]);

  // The sidebar's Print verb (`qc-labels.print`) opens the Print form.
  useNavIntent('qc-labels:print', () => {
    setPrinting(true);
    replace((params) => params.delete('open'));
  });

  const renderRecord = useCallback(
    (row: QcLabelRow, open: boolean) => (
      <QcLabelRecord row={row} open={open} onOpen={() => openRecordKey(String(row.serial_unit_id))} />
    ),
    [openRecordKey],
  );
  const summary = useMemo(() => qcLabelSummary(rows), [rows]);
  const narrowed = Boolean(searchParams.get('q')?.trim()) || Boolean(searchParams.get('view'));

  return (
    <RecordLedger
      testId="qc-labels-ledger"
      label="QC labels"
      records={rows}
      recordKey={(row) => String(row.serial_unit_id)}
      renderRecord={renderRecord}
      openKey={printing ? PRINT_KEY : openKey}
      onOpenKey={openRecordKey}
      onClose={closeRecord}
      empty={
        <>
          <b className="text-role-body font-bold text-mode-ink">{narrowed ? 'No QC labels match' : 'No QC labels printed yet'}</b>
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            {narrowed ? 'Clear the search or pick All labels' : 'Print one from a scanned serial'}
          </span>
        </>
      }
      footer={
        <span className="tabular-nums" data-testid="qc-labels-status">
          {rows.length} label{rows.length === 1 ? '' : 's'}
          {capped ? ` · first ${rows.length} of ${totalCount} — narrow the search` : ''}
        </span>
      }
      recordTitle={printing ? 'Print QC label' : openRecord ? openRecord.title : 'Not in this list'}
      recordSubtitle={!printing && openRecord ? qcLabelHandle(openRecord) : undefined}
      recordNoun={printing ? 'print form' : 'QC label'}
      summary={summary}
      record={
        <DeskRecordLayout
          main={
            printing ? (
              <QcLabelPrintForm
                onPrinted={() => {
                  setPrinting(false);
                  router.refresh();
                }}
              />
            ) : openRecord ? (
              <QcLabelEvidence key={openRecord.serial_unit_id} row={openRecord} onPrinted={() => router.refresh()} />
            ) : (
              <EvidenceNotice>This label is not in the current list.</EvidenceNotice>
            )
          }
        />
      }
    />
  );
}

function qcLabelSummary(rows: readonly QcLabelRow[]): RecordLedgerSummary {
  let onOrders = 0;
  let bound = 0;
  let reprints = 0;
  for (const row of rows) {
    if (row.order_id != null) onOrders += 1;
    if (row.serial_on_order) bound += 1;
    reprints += row.reprint_count;
  }
  return {
    title: 'QC labels',
    facts: [
      { label: 'Labelled units', value: rows.length },
      { label: 'On orders', value: onOrders, toolbar: true },
      { label: 'Serial on order', value: bound, toolbar: true },
      { label: 'Not yet on order', value: onOrders - bound, warn: onOrders - bound > 0, toolbar: true },
      { label: 'Reprints', value: reprints },
    ],
  };
}

const QcLabelRecord = memo(function QcLabelRecord({ row, open, onOpen }: { row: QcLabelRow; open: boolean; onOpen: () => void }) {
  const state = QC_LABEL_LIFECYCLE[qcLabelStage(row)];
  const handle = qcLabelHandle(row);
  return (
    <IndustrialRecord
      recordKey={String(row.serial_unit_id)}
      state={state}
      open={open}
      openLabel={`QC label ${handle}, serial ${row.serial_number ?? 'none'}, ${row.title}`}
      onOpen={onOpen}
      photo={<RecordPhoto src={null} fallback={row.title} />}
      bands={[
        {
          main: (
            <>
              <RecordStateCode state={state} />
              <RecordBin faces={[handle]} className={RECORD_LOCATION_CLASS} />
              <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>{row.location ?? 'No location'}</span>
            </>
          ),
          right: <RecordStamp title={stamp(row.last_printed_at) ?? undefined}>{stamp(row.last_printed_at, 'MMM d')}</RecordStamp>,
        },
        { main: <RecordTitle>{row.title}</RecordTitle> },
        {
          main: (
            <>
              <RecordIdFact label="SN" value={row.serial_number} className="w-56 shrink-0" />
              <RecordIdFact label="SKU" value={row.sku} className="w-40 shrink-0" />
              {row.order_label || row.order_id ? (
                <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', row.serial_on_order ? 'text-mode-ink' : 'text-mode-warn')}>
                  #{row.order_label ?? row.order_id}
                </span>
              ) : null}
            </>
          ),
          right: <RecordNext label={row.reprint_count > 0 ? `×${row.print_count}` : null} />,
        },
      ]}
    />
  );
});

function QcLabelEvidence({ row, onPrinted }: { row: QcLabelRow; onPrinted: () => void }) {
  const [busy, setBusy] = useState(false);
  const state = QC_LABEL_LIFECYCLE[qcLabelStage(row)];
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
  return (
    <div className="flex min-h-0 flex-col" data-testid="qc-label-evidence">
      <EvidenceTitle sub={row.title}>{row.serial_number ?? qcLabelHandle(row)}</EvidenceTitle>
      <EvidenceStateStrip state={state} />
      {row.order_id != null && !row.serial_on_order ? (
        <EvidenceNotice tone="warn">
          Held for order #{row.order_label ?? row.order_id}; the serial joins the order when the picker scans this label.
        </EvidenceNotice>
      ) : null}
      <EvidenceSection label="Label">
        <EvidenceFacts>
          <EvidenceFact label="Unit id" mono>{qcLabelHandle(row)}</EvidenceFact>
          <EvidenceFact label="Serial" mono>{row.serial_number ?? '—'}</EvidenceFact>
          <EvidenceFact label="SKU" mono>{row.sku ?? '—'}</EvidenceFact>
          <EvidenceFact label="Condition">{row.condition_grade ? conditionLabel(row.condition_grade) : '—'}</EvidenceFact>
          <EvidenceFact label="Printed">
            {stamp(row.first_printed_at)}
            {row.print_count > 1 ? ` · ${row.print_count} prints, last ${stamp(row.last_printed_at)}` : ''}
            {row.last_printed_by_name ? ` · ${row.last_printed_by_name}` : ''}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceSection label="Quality control">
        <EvidenceFacts>
          <EvidenceFact label="Tested by">{row.tested_by_name ?? '—'}</EvidenceFact>
          <EvidenceFact label="Tested">{stamp(row.tested_at) ?? '—'}</EvidenceFact>
          <EvidenceFact label="Unit status">{row.current_status}</EvidenceFact>
          <EvidenceFact label="Location">{row.location ?? '—'}</EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceSection label="Outbound">
        <EvidenceFacts>
          <EvidenceFact label="Order">
            {row.order_id != null ? (
              <Link className="underline underline-offset-2" href={`/shipping/orders?openOrderId=${row.order_id}`}>
                #{row.order_label ?? row.order_id}
              </Link>
            ) : (
              'Not on an order'
            )}
          </EvidenceFact>
          <EvidenceFact label="Allocation">{row.allocation_state ?? '—'}</EvidenceFact>
          <EvidenceFact label="Serial on order">{row.order_id == null ? '—' : row.serial_on_order ? 'Yes' : 'Not yet — picks on scan'}</EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceDecisionBar
        verbs={[{ label: 'Reprint', onPress: () => void reprint(), primary: true, disabled: busy, icon: <Printer aria-hidden />, testId: 'qc-label-reprint' }]}
      />
    </div>
  );
}

function QcLabelPrintForm({ onPrinted }: { onPrinted: () => void }) {
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
    <div className="flex min-h-0 flex-col" data-testid="qc-label-print-form">
      <EvidenceTitle sub="Scan the unit's serial or its old label">Print QC label</EvidenceTitle>
      {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
      <EvidenceSection label="Unit">
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
      </EvidenceSection>
      <EvidenceDecisionBar
        verbs={[{ label: 'Print', onPress: () => void submit(), primary: true, disabled: busy || !scan.trim(), icon: <Printer aria-hidden />, testId: 'qc-label-print' }]}
      />
    </div>
  );
}
