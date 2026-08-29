'use client';

/**
 * To-Ship CSV import staging — session preview before `ingestCanonicalOrders`.
 *
 * House find-only chrome (`display/workbench-ops-queue.md` → Band 3):
 *
 * ```text
 * Band 1   shot.csv · 128 rows ………………………  [ Cancel ] [ Confirm 96 ready ]
 * Band 3   🔍 find ……………………………… ▽ refine        [ ▦ ] [ ▥ inspector ]
 *          ── hairline ──
 *          NonlinearTableHost over `orders-import.staging`
 * ```
 *
 * Band 1 carries identity plus ONE primary CTA and one quiet exit. Ready /
 * Action-required is a facet that narrows ROWS, so it rides IN the find field
 * (`FilterMenu density="field"`), not as a chip band. `▦` is
 * portal-or-nothing — it mounts into the Band-3 controls slot. Everything else
 * (row fix · column mapping · batch facts · selection verbs) lives on the right
 * rail (`CsvImportStagingRail`).
 *
 * Live-queue bulk verbs stay on the selection-plane rail — this host never
 * mounts a page-bottom capsule.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { requestConfirm } from '@/design-system/components/confirm';
import { FileText, Loader2, Upload, X } from '@/components/Icons';
import { DataTable } from '@/components/tables/DataTable';


import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import {
  emitSelection,
  emitSelectionTotal,
  onToggleAll,
} from '@/lib/selection/table-selection';
import type { RowGroup } from '@/lib/group-rows';
import {
  ORDER_IMPORT_DESCRIPTOR,
  type OrderImportRowView,
} from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportDraft,
  clearTableImportSelection,
  discardTableImportSelected,
  getTableImportDraft,
  listTableImportRows,
  setTableImportFilter,
  setTableImportFocusRow,
  setTableImportQuery,
  setTableImportSelected,
  tableImportConfirmTargets,
  toggleTableImportSelected,
  useTableImportDraft,
  type TableImportFilter,
} from '@/lib/tables/import/staging-store';
import { CsvImportStagingRail } from '@/components/outbound/orders/CsvImportStagingRail';
import { CSV_IMPORT_STAGING_TABLE_BINDING } from '@/components/outbound/orders/import-staging/csv-import-staging-table-definition';
import {
  CsvImportStagingGridRow,
  csvImportStagingRowKey,
} from '@/components/outbound/orders/import-staging/CsvImportStagingGridRow';
import {
  defaultDirForCsvImportStagingGridSort,
  isCsvImportStagingGridSortable,
  type CsvImportStagingGridColumn,
  type CsvImportStagingGridColumnKey,
} from '@/components/outbound/orders/import-staging/csv-import-staging-grid-layout';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { refreshDomain } from '@/lib/refresh/bus';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

/**
 * Selection scope for the grid header's select-all. The staging store stays the
 * selection SoT — `table-selection` is an event bus, not a second store, so the
 * header reads what this host publishes and drives it back through `onToggleAll`.
 */
const CSV_IMPORT_STAGING_SELECTION_SCOPE = 'csv-import-staging';

/** One family, one store key — the descriptor is the seam's entry point. */
const SURFACE = ORDER_IMPORT_DESCRIPTOR.surfaceId;

const STATUS_FILTERS: { id: TableImportFilter; label: string }[] = [
  { id: 'all', label: 'All rows' },
  { id: 'ready', label: 'Ready' },
  { id: 'action_required', label: 'Action required' },
];

function compareStagingRows(
  a: OrderImportRowView,
  b: OrderImportRowView,
  key: CsvImportStagingGridColumnKey,
  dir: 'asc' | 'desc',
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'order':
      return sign * a.orderNumber.localeCompare(b.orderNumber);
    // Action required first when ascending — the rows that need a human.
    case 'status':
      return sign * (Number(a.status === 'ready') - Number(b.status === 'ready'));
    case 'sku':
      return sign * a.sku.localeCompare(b.sku);
    case 'qty':
      return sign * ((Number(a.quantity) || 0) - (Number(b.quantity) || 0));
    case 'customer':
      return sign * a.customerName.localeCompare(b.customerName);
    case 'tracking':
      return sign * a.trackingNumber.localeCompare(b.trackingNumber);
    case 'platform':
      return sign * a.platform.localeCompare(b.platform);
    default:
      return 0;
  }
}

export function CsvImportStagingHost() {
  const draft = useTableImportDraft(SURFACE);
  const { setActive: setStagingActive } = useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<CsvImportStagingGridColumnKey>({
    isColumn: isCsvImportStagingGridSortable,
    defaultDir: defaultDirForCsvImportStagingGridSort,
  });

  const exitStaging = useCallback(() => {
    // Stop painting first (shared pending), then drop the session draft.
    setStagingActive(false);
    clearTableImportDraft(SURFACE);
  }, [setStagingActive]);

  const views = useMemo(() => {
    const list = draft ? listTableImportRows(ORDER_IMPORT_DESCRIPTOR, draft) : [];
    if (!columnSort || !sortDir) return list;
    return [...list].sort((a, b) => compareStagingRows(a, b, columnSort, sortDir));
  }, [draft, columnSort, sortDir]);

  const orderGroupsByDate = useMemo<[string, RowGroup<OrderImportRowView>[]][]>(
    () => [['', views.map((row) => ({ key: csvImportStagingRowKey(row), rows: [row] }))]],
    [views],
  );

  const confirmTargets = useMemo(
    () => (draft ? tableImportConfirmTargets(ORDER_IMPORT_DESCRIPTOR, draft) : null),
    [draft],
  );
  const confirmCount = confirmTargets?.indexes.length ?? 0;

  const selectedIndexes = draft?.selectedIndexes;
  const visibleIndexes = useMemo(() => views.map((v) => v.index), [views]);

  // Publish what the header's select-all reads; take its toggle back into the
  // staging store. One selection SoT, two subscribers.
  useEffect(() => {
    if (!selectedIndexes) return;
    emitSelection(
      CSV_IMPORT_STAGING_SELECTION_SCOPE,
      Array.from(selectedIndexes).map((index) => ({ id: index })),
    );
  }, [selectedIndexes]);

  useEffect(() => {
    emitSelectionTotal(CSV_IMPORT_STAGING_SELECTION_SCOPE, visibleIndexes.length);
  }, [visibleIndexes]);

  useEffect(
    () =>
      onToggleAll(CSV_IMPORT_STAGING_SELECTION_SCOPE, (mode) => {
        if (mode === 'all') setTableImportSelected(SURFACE, visibleIndexes);
        else clearTableImportSelection(SURFACE);
      }),
    [visibleIndexes],
  );

  const handleConfirm = useCallback(async () => {
    if (!draft || !confirmTargets || confirmTargets.indexes.length === 0) return;
    const { indexes, scoped, skipped } = confirmTargets;
    const noun = `${indexes.length} ready order${indexes.length === 1 ? '' : 's'}`;
    const ok = await requestConfirm({
      title: 'Import ready orders into To-Ship?',
      description: skipped > 0
        ? `Import ${noun}. ${skipped} action-required row${skipped === 1 ? '' : 's'} in the selection will be skipped.`
        : scoped
          ? `Import the ${noun} you selected into the live To-Ship queue.`
          : `Import ${noun} into the live To-Ship queue.`,
      confirmLabel: `Import ${indexes.length}`,
      tone: 'primary',
    });
    if (!ok) return;

    setSubmitting(true);
    setSubmitError(null);
    const rows = indexes.map((i) => draft.rows[i]);
    const outcome = await ORDER_IMPORT_DESCRIPTOR.commit({ rows, mapping: draft.mapping });
    setSubmitting(false);
    if (!outcome.ok) {
      setSubmitError(outcome.error);
      return;
    }
    refreshDomain('orders.outbound');
    exitStaging();
  }, [confirmTargets, draft, exitStaging]);

  // Arming lives on the rail's flush Delete; the last row leaving takes the
  // (now empty) draft with it rather than stranding an empty sheet.
  const handleDiscardSelected = useCallback(() => {
    discardTableImportSelected(SURFACE);
    if ((getTableImportDraft(SURFACE)?.rows.length ?? 0) === 0) {
      exitStaging();
    }
  }, [exitStaging]);

  const handleCancelDraft = useCallback(async () => {
    const ok = await requestConfirm({
      title: 'Leave CSV staging?',
      description: 'This clears the import draft. Nothing has been written to To-Ship yet.',
      confirmLabel: 'Leave staging',
      tone: 'danger',
    });
    if (!ok) return;
    exitStaging();
  }, [exitStaging]);

  if (!draft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-canvas p-8">
        <p className="text-role-caption text-text-soft">No CSV draft loaded.</p>
        <Button variant="secondary" size="sm" onClick={exitStaging}>
          Back to To-Ship
        </Button>
      </div>
    );
  }

  const filter = draft.filter;
  const activeFilterLabel =
    STATUS_FILTERS.find((f) => f.id === filter)?.label ?? 'All rows';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-card">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border-soft bg-surface-card px-3 py-1">
        <div className="flex min-w-0 items-center gap-2" data-testid="csv-import-staging-identity">
          <FileText className="h-4 w-4 shrink-0 text-text-soft" />
          <span className="truncate text-role-caption font-semibold text-text-default">
            {draft.fileName}
          </span>
          <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            {draft.rows.length} rows
          </span>
        </div>
        {/* The two verbs that COMMIT the draft. Not a toolbar — the staging
            host is a decision, and these are the decision. */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => void handleCancelDraft()}
            className={cornerClass('flush')}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={submitting || confirmCount === 0}
            icon={
              submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )
            }
            onClick={() => void handleConfirm()}
            className={cn(cornerClass('flush'), 'font-semibold uppercase tracking-widest')}
            data-testid="csv-import-staging-confirm"
          >
            {submitting ? 'Importing…' : `Confirm ${confirmCount} ready`}
          </Button>
        </div>
      </div>
      <div className="shrink-0">
        {submitError ? (
          <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-role-micro font-semibold text-rose-700">
            {submitError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DataTable<
          OrderImportRowView,
          CsvImportStagingGridColumnKey,
          CsvImportStagingGridColumn
        >
          binding={CSV_IMPORT_STAGING_TABLE_BINDING}
          orderGroupsByDate={orderGroupsByDate}
          rows={views}
          getRowId={csvImportStagingRowKey}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={false}
          emptyMessage="This file has no rows left to import."
          searchEmptyMessage="No rows match this filter."
          selectionScope={CSV_IMPORT_STAGING_SELECTION_SCOPE}
          search={{
            value: draft.query,
            onChange: (next) => setTableImportQuery(SURFACE, next),
            placeholder: 'Find staged rows…',
          }}
          filter={{
            options: STATUS_FILTERS.filter((o) => o.id !== 'all').map((o) => ({
              id: o.id,
              label: o.label,
              active: filter === o.id,
            })),
            onToggle: (id) =>
              setTableImportFilter(SURFACE, id === filter ? 'all' : (id as typeof filter)),
            onClearAll: () => setTableImportFilter(SURFACE, 'all'),
          }}
          renderGroup={(group, _stripe, { columns: visible }) => (
            <>
              {group.rows.map((row) => (
                <StagingLeaf key={csvImportStagingRowKey(row)} row={row} columns={visible} />
              ))}
            </>
          )}
          renderRow={(row, _stripe, { columns: visible }) => (
            <StagingLeaf row={row} columns={visible} />
          )}
        />
      </div>

      {/* The rail reads the draft store directly now — it no longer needs the
          visible index list handed to it. */}
      <CsvImportStagingRail onDiscardSelected={handleDiscardSelected} />
    </div>
  );
}

/** Thin leaf binder — keeps the store reads in one place for both render props. */
function StagingLeaf({
  row,
  columns,
}: {
  row: OrderImportRowView;
  columns: readonly CsvImportStagingGridColumn[];
}) {
  const draft = useTableImportDraft(SURFACE);
  return (
    <CsvImportStagingGridRow
      row={row}
      mapping={draft?.mapping ?? {}}
      checked={Boolean(draft?.selectedIndexes.has(row.index))}
      focused={draft?.focusRowIndex === row.index}
      onToggle={(index: number) => toggleTableImportSelected(SURFACE, index)}
      onOpen={(index: number) => setTableImportFocusRow(SURFACE, index)}
      columns={columns}
    />
  );
}
