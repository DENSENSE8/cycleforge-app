'use client';

/**
 * Inventory › **QC labels** — one record per serial unit carrying a printed QC
 * / pre-box label (template `product`), as the canonical spreadsheet:
 * status · label id · product · serial · SKU · location · order · print facts.
 * The sticker's DataMatrix is the
 * unit's `unit_uid` (else `U-{serial}`); the picker scans it and the pick
 * binds that serial to the order (`linkPickedSerialToOrder`), which the record
 * shows as "Serial on order". Print = a unit's label, from a scan or a typed
 * serial; the open unit is the shared QC unit record (`useQcUnitRecord` →
 * `RecordView`), its verdicts and Reprint in the header. Every
 * sticker is a `label_print_jobs` row.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { PrepackForm } from '@/features/prepack/PrepackForm';
import { DeskRecordLayout, DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { useQcUnitRecord } from '@/components/qc/qc-unit-record';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import {
  RecordLedgerSummaryPane,
  type RecordLedgerSummary,
} from '@/design-system/components/record-ledger/RecordLedgerSummary';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { RowGroup } from '@/lib/group-rows';
import { qcLabelHandle, qcLabelStage, qcLabelUsesInternalSerial, type QcLabelRow } from '@/lib/labels/qc-label-row';
import { QC_LABELS_PATH } from '@/lib/labels/qc-label-views';
import { PREPACK_QUERY_KEYS, prepackHref } from '@/lib/nav/route-tree';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { parsePrepackRouteState } from '@/lib/prepack/url';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { RECORD_ROOT_CLASS, qcLabelReprintVerb } from './QcLabelRecord';
import { QcLabelGridRow } from './grid/QcLabelGridRow';
import { QC_LABELS_TABLE_BINDING } from './grid/qc-labels-table-definition';
import type { QcLabelsGridColumn, QcLabelsGridColumnKey } from './grid/qc-labels-grid-layout';
import { PrepackSerialField } from './PrepackSerialField';

const qcRowId = (row: QcLabelRow): number => row.serial_unit_id;

export function QcLabelsLedger({ rows, totalCount, capped }: { rows: QcLabelRow[]; totalCount: number; capped: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskIsPrepack = searchParams.get('task') === 'prepack';
  const [printing, setPrinting] = useState(taskIsPrepack);

  useEffect(() => {
    setPrinting(taskIsPrepack);
  }, [taskIsPrepack]);

  /** Records and the full-canvas prepack task share one URL state writer; leaving the task drops every prepack key. */
  const writeSurface = useCallback(
    ({ open, task }: { open?: string | null; task?: 'prepack' | null }) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (task) {
        params.delete('open');
        window.history.replaceState(null, '', prepackHref('desktop', {}, params));
        return;
      }
      for (const key of PREPACK_QUERY_KEYS) params.delete(key);
      if (open) params.set('open', open);
      else params.delete('open');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${QC_LABELS_PATH}?${qs}` : QC_LABELS_PATH);
    },
    [searchParams],
  );

  const [sort, setSort] = useState<QcLabelsGridColumnKey>('last-printed');
  const [dir, setDir] = useState<GridSortDir>('desc');
  const orderedRows = useMemo(
    () => [...rows].sort((a, b) => compareQcLabelRows(a, b, sort, dir)),
    [rows, sort, dir],
  );
  const bands = useMemo<[string, RowGroup<QcLabelRow>[]][]>(
    () => (orderedRows.length ? [['labels', orderedRows.map((row) => ({ key: String(row.serial_unit_id), rows: [row] }))]] : []),
    [orderedRows],
  );

  const openKey = searchParams.get('open')?.trim() || null;
  const openUnitId = openKey && /^\d+$/.test(openKey) ? Number(openKey) : null;
  const openRecord = useMemo(
    () => (openUnitId != null ? (rows.find((row) => row.serial_unit_id === openUnitId) ?? null) : null),
    [openUnitId, rows],
  );
  const openRow = useCallback(
    (row: QcLabelRow) => {
      setPrinting(false);
      writeSurface({ open: String(row.serial_unit_id) });
    },
    [writeSurface],
  );
  const closeRecord = useCallback(() => {
    setPrinting(false);
    writeSurface({});
  }, [writeSurface]);

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

  // The sidebar's Print verb opens the complete shared prepack + print task on the desk.
  useNavIntent('qc-labels:print', () => {
    setPrinting(true);
    writeSurface({ task: 'prepack' });
  });

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

  if (printing) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="qc-labels-prepack-task">
        <PrepackForm
          surface="desktop"
          initial={parsePrepackRouteState(searchParams)}
          serialEntry={PrepackSerialField}
          onPrinted={() => router.refresh()}
        />
      </div>
    );
  }

  const list = (
    <DataTable<QcLabelRow, QcLabelsGridColumnKey, QcLabelsGridColumn>
      binding={QC_LABELS_TABLE_BINDING}
      rows={orderedRows}
      orderGroupsByDate={bands}
      getRowId={(row) => String(row.serial_unit_id)}
      loading={false}
      emptyMessage="No QC labels have been printed yet. Print one from a scanned unit label."
      searchEmptyMessage="No QC labels match. Clear Find or choose All."
      isNarrowed={narrowed}
      totalCount={totalCount}
      sort={sort}
      dir={dir}
      onSortChange={(key, nextDir) => {
        setSort(key);
        setDir(nextDir);
      }}
      testId="qc-labels-table"
      ariaLabel="QC product labels"
      bodyPrefix={capped ? (
        <p className="border-b border-border-soft px-3 py-2 text-role-caption text-text-warning" data-testid="qc-labels-capped">
          Showing the first {rows.length} of {totalCount} labels. Narrow Find to load a specific label.
        </p>
      ) : null}
      renderGroup={(group, _stripe, { columns }) => (
        <>{group.rows.map((row) => <QcLabelGridRow key={row.serial_unit_id} row={row} columns={columns} onOpen={openRow} />)}</>
      )}
      renderRow={(row, _stripe, { columns }) => (
        <QcLabelGridRow key={row.serial_unit_id} row={row} columns={columns} onOpen={openRow} />
      )}
    />
  );

  const recordView = slot ? slot.view : openRecord || openKey ? (
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
  ) : null;

  return (
    <DeskRecordPlane
      open={openUnitId != null}
      onClose={closeRecord}
      title={slot?.title ?? (openRecord ? qcLabelHandle(openRecord) : 'QC label')}
      actions={slot?.actions}
      recordNoun="QC label"
      recordKey={openUnitId == null ? null : String(openUnitId)}
      testId="qc-label-record"
      list={list}
      summary={<RecordLedgerSummaryPane summary={summary} />}
      splitPane="open"
    >
      {recordView}
    </DeskRecordPlane>
  );
}

function compareQcLabelRows(
  a: QcLabelRow,
  b: QcLabelRow,
  sort: QcLabelsGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const text = (left: string | null | undefined, right: string | null | undefined) =>
    String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  let value = 0;
  switch (sort) {
    case 'status': value = text(qcLabelStage(a), qcLabelStage(b)); break;
    case 'label': value = text(qcLabelHandle(a), qcLabelHandle(b)); break;
    case 'product': value = text(a.title, b.title); break;
    case 'serial': value = text(qcLabelUsesInternalSerial(a.serial_number) ? '' : a.serial_number, qcLabelUsesInternalSerial(b.serial_number) ? '' : b.serial_number); break;
    case 'sku': value = text(a.sku, b.sku); break;
    case 'location': value = text(a.location, b.location); break;
    case 'order': value = text(a.order_label ?? String(a.order_id ?? ''), b.order_label ?? String(b.order_id ?? '')); break;
    case 'prints': value = a.print_count - b.print_count; break;
    case 'last-printed': value = text(a.last_printed_at, b.last_printed_at); break;
  }
  return sign * (value || b.serial_unit_id - a.serial_unit_id);
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
