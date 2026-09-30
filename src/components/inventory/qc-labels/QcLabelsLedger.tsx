'use client';

/**
 * Inventory › **QC labels** — one record per serial unit carrying a printed QC
 * / pre-box label (template `product`), as the one-row triage list
 * (`TriageCardList density="row"`, owner 2026-09-28): state · unit id · title
 * · SN · SKU · order · reprints → Pick / Pack. The sticker's DataMatrix is the
 * unit's `unit_uid` (else `U-{serial}`); the picker scans it and the pick
 * binds that serial to the order (`linkPickedSerialToOrder`), which the record
 * shows as "Serial on order". Print = a unit's label, from a scan or a typed
 * serial; the open unit is the shared QC unit record (`useQcUnitRecord` →
 * `RecordView`), its verdicts and Reprint in the header. Every
 * sticker is a `label_print_jobs` row.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { useQcUnitRecord } from '@/components/qc/qc-unit-record';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import {
  RecordLedgerSummaryPane,
  RecordLedgerTally,
  type RecordLedgerSummary,
} from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { QC_LABEL_LIFECYCLE } from '@/design-system/tokens/qc-label-lifecycle';
import type { RowGroup } from '@/lib/group-rows';
import { qcLabelHandle, qcLabelStage, type QcLabelRow } from '@/lib/labels/qc-label-row';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { QC_LABELS_VIEW } from '@/lib/triage/views';
import { QC_LABEL_NEXT, QcLabelPrintForm, RECORD_ROOT_CLASS, qcLabelReprintVerb, stamp } from './QcLabelRecord';

const VIEW = QC_LABELS_VIEW;

/** The plane's record id while it holds the Print form (no unit carries it). */
const PRINT_ID = -1;

/** No chips: the view (`?view=`) and Find are the sidebar's, narrowed on the server. */
const NO_CHIPS: readonly never[] = [];

const qcRowId = (row: QcLabelRow): number => row.serial_unit_id;

type QcRowModel = { key: string; ids: readonly number[]; lead: QcLabelRow };

export function QcLabelsLedger({ rows, totalCount, capped }: { rows: QcLabelRow[]; totalCount: number; capped: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [printing, setPrinting] = useState(false);

  /** The open record moves within the loaded list: History API, no server round-trip (J / K stay instant). */
  const writeOpen = useCallback(
    (key: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (key) params.set('open', key);
      else params.delete('open');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${QC_LABELS_PATH}?${qs}` : QC_LABELS_PATH);
    },
    [searchParams],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<QcLabelRow>[]][]>(
    () => (rows.length ? [['labels', rows.map((row) => ({ key: String(row.serial_unit_id), rows: [row] }))]] : []),
    [rows],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const openKey = searchParams.get('open')?.trim() || null;
  const openUnitId = openKey && /^\d+$/.test(openKey) ? Number(openKey) : null;
  const openRecord = useMemo(
    () => (openUnitId != null ? (rows.find((row) => row.serial_unit_id === openUnitId) ?? null) : null),
    [openUnitId, rows],
  );
  const openRow = useCallback(
    (row: QcLabelRow) => {
      setPrinting(false);
      writeOpen(String(row.serial_unit_id));
    },
    [writeOpen],
  );
  const closeRecord = useCallback(() => {
    setPrinting(false);
    writeOpen(null);
  }, [writeOpen]);

  usePublishRecordCursor({
    surfaceId: 'qc-label-rows',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: printing ? null : openUnitId,
    getId: qcRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  // The sidebar's Print verb (`qc-labels.print`) opens the Print form.
  useNavIntent('qc-labels:print', () => {
    setPrinting(true);
    writeOpen(null);
  });

  const selection = useLocalTriageSelection(qcRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: qcRowId,
        groupKey: (group: RowGroup<QcLabelRow>) => group.key,
        cardModel: (group: RowGroup<QcLabelRow>): QcRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [lead.serial_unit_id], lead };
        },
        // A Find naming exactly one sticker (unit id) or serial opens it.
        exactFind: (query: string, model: QcRowModel) =>
          qcLabelHandle(model.lead).toLowerCase() === query || model.lead.serial_number?.toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<QcLabelRow, QcRowModel>) => <QcLabelListRow {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<QcLabelRow> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    loading: false,
    fetching: false,
    search: { value: searchParams.get('q') ?? '', pending: false },
    selection,
    open: { id: printing ? PRINT_ID : openUnitId, open: openRow, close: closeRecord },
  };

  const summary = useMemo(() => qcLabelSummary(rows), [rows]);
  const qc = useQcUnitRecord(printing ? null : (openRecord?.serial_unit_id ?? null), {
    label: openRecord,
    onRecorded: () => router.refresh(),
  });
  const slot = useRecordSlot(
    qc.record?.model ?? null,
    qc.record && openRecord ? [...qc.record.verbs, qcLabelReprintVerb(openRecord, () => router.refresh())] : [],
    openRecord ? `QC label ${qcLabelHandle(openRecord)} actions` : 'QC label actions',
    'qc-record',
  );
  const narrowed = Boolean(searchParams.get('q')?.trim()) || Boolean(searchParams.get('view'));

  return (
    <TriageCardList
      density="row"
      family={family}
      feed={feed}
      cut={cut}
      // No chips: the view and Find are the sidebar's.
      summary={null}
      bulk={<span className="truncate text-sm text-text-muted">Open one to reprint it</span>}
      // The list's tally rides one line under the bar (the Stock desk's shape).
      banner={
        <div className="flex min-w-0 items-center gap-3 pb-2 pl-4" data-testid="qc-labels-tally">
          {capped ? (
            <p className="truncate text-sm text-text-warning" data-testid="qc-labels-capped">
              First {rows.length} of {totalCount} labels — narrow the search
            </p>
          ) : null}
          <span className="ml-auto flex">
            <RecordLedgerTally summary={summary} />
          </span>
        </div>
      }
      searchEmpty={narrowed ? <p className="text-sm text-text-muted">No QC labels match — clear the search or pick All labels.</p> : null}
      allClear={<TriageAllClear title="No QC labels printed yet" detail="Print one from a scanned serial." />}
      record={{
        // The record is the UNIT: `# SN … · SKU · tested`; its sticker identity reads under Label.
        title: printing ? 'Print QC label' : (slot?.title ?? (openRecord ? qcLabelHandle(openRecord) : 'Not in this list')),
        actions: printing ? undefined : slot?.actions,
        noun: printing ? 'print form' : 'QC label',
        testId: 'qc-label-record',
        summary: <RecordLedgerSummaryPane summary={summary} />,
        strip: null,
        view: printing ? (
          <QcLabelPrintForm
            onPrinted={() => {
              setPrinting(false);
              router.refresh();
            }}
          />
        ) : slot ? (
          slot.view
        ) : openRecord || openKey ? (
          <div className={RECORD_ROOT_CLASS}>
            <DeskRecordLayout
              main={
                <EvidenceNotice tone={openRecord && !qc.error ? undefined : 'warn'}>
                  {!openRecord
                    ? 'This label is not in the current list.'
                    : qc.error
                      ? `The unit could not be read — ${qc.error}`
                      : 'Reading the unit…'}
                </EvidenceNotice>
              }
            />
          </div>
        ) : null,
      }}
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

/** One labelled unit as a row: state · unit id · title · SN · SKU · order · reprints → Pick / Pack. */
const QcLabelListRow = memo(function QcLabelListRow(props: TriageCardSlotProps<QcLabelRow, QcRowModel>) {
  const row = props.model.lead;
  const face = useMemo<TriageRowFace>(() => {
    const stage = qcLabelStage(row);
    const handle = qcLabelHandle(row);
    const order = row.order_label ?? (row.order_id != null ? String(row.order_id) : null);
    const next = QC_LABEL_NEXT[stage] ?? null;
    return {
      state: QC_LABEL_LIFECYCLE[stage],
      identity: handle,
      identityWidth: 'long',
      title: row.title,
      facts: [
        { id: 'serial', label: 'SN', value: row.serial_number ? { kind: 'code', text: row.serial_number, title: `SN ${row.serial_number}` } : null, width: 'code' },
        { id: 'sku', label: 'SKU', value: row.sku ? { kind: 'code', text: row.sku, title: `SKU ${row.sku}` } : null, width: 'code' },
        {
          id: 'order',
          value: order ? `#${order}` : null,
          width: 'short',
          // Held for the order, serial not bound yet: the pick scan of this label closes the loop.
          tone: row.serial_on_order ? 'default' : 'warn',
          tip: order ? (row.serial_on_order ? `Serial on order #${order}` : `Held for #${order} — joins when picked`) : undefined,
        },
        {
          id: 'prints',
          value: row.reprint_count > 0 ? `Printed ${row.print_count}×` : null,
          width: 'short',
          tone: 'muted',
          tip: row.reprint_count > 0 ? `Reprinted ${row.reprint_count}×, last ${stamp(row.last_printed_at) ?? '—'}` : undefined,
        },
      ],
      next: next ? { label: next } : null,
      aria: {
        row: `QC label ${handle}, serial ${row.serial_number ?? 'none'}, ${row.title}`,
        open: `Open QC label ${handle}`,
        check: `Select QC label ${handle}`,
      },
    };
  }, [row]);
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} />;
});
