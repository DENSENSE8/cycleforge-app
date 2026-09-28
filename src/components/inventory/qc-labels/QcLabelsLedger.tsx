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
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { EVIDENCE_CONTROL_CLASS, EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RECORD_LOCATION_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { RECORD_FACT_KEY_CLASS, RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { QC_LABEL_LIFECYCLE } from '@/design-system/tokens/qc-label-lifecycle';
import { qcLabelHandle, qcLabelStage, type QcLabelRow, type QcLabelStage } from '@/lib/labels/qc-label-row';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { toast } from '@/lib/toast';
import { conditionLabel } from '@/lib/conditions';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { cn } from '@/utils/_cn';

/** Record key while the record plane holds the Print form. */
const PRINT_KEY = 'print-qc-label';

/** Fact rows inside a group — the carton record's facts body. */
const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** The record body on the stage canvas — groups lift as cards in triage, run edge to edge on the Floor rail. */
const RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink industrial:p-0';

/** Where the labelled unit goes next in the outbound loop (none once it rests or ships). */
const QC_LABEL_NEXT: Readonly<Partial<Record<QcLabelStage, string>>> = {
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
      // The record is the LABEL: its sticker identity heads it; the product reads on the item card.
      recordTitle={printing ? 'Print QC label' : openRecord ? qcLabelHandle(openRecord) : 'Not in this list'}
      recordSubtitle={!printing && openRecord?.serial_number ? `SN ${openRecord.serial_number}` : undefined}
      recordNoun={printing ? 'print form' : 'QC label'}
      recordActions={!printing && openRecord ? <QcLabelRecordStatus row={openRecord} /> : undefined}
      summary={summary}
      record={
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
          <div className={RECORD_ROOT_CLASS}>
            <DeskRecordLayout main={<EvidenceNotice>This label is not in the current list.</EvidenceNotice>} />
          </div>
        )
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

/** The label's ONE status, top-right of the record header: where the unit is in the outbound loop, and what comes next. */
function QcLabelRecordStatus({ row }: { row: QcLabelRow }) {
  const stage = qcLabelStage(row);
  const state = QC_LABEL_LIFECYCLE[stage];
  const next = QC_LABEL_NEXT[stage] ?? null;
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="qc-label-record-status">
      <LifecycleCode state={state} srLabel={null}>
        {state.code} · {state.label}
      </LifecycleCode>
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
function QcLabelEvidence({ row, onPrinted }: { row: QcLabelRow; onPrinted: () => void }) {
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
