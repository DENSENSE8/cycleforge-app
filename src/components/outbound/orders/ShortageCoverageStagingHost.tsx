'use client';

/**
 * Shortage CSV coverage staging — session preview before attaching coverage
 * to existing BLOCKED orders. Clone of To-ship CsvImportStagingHost: DataTable,
 * Ready / Action required filter, Confirm Ready only.
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
  SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR,
  markShortageCoverageDuplicates,
  type ShortageCoverageImportRowView,
} from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  clearTableImportDraft,
  clearTableImportSelection,
  discardTableImportSelected,
  getTableImportDraft,
  setTableImportFilter,
  setTableImportFocusRow,
  setTableImportQuery,
  setTableImportSelected,
  toggleTableImportSelected,
  useTableImportDraft,
  type TableImportFilter,
} from '@/lib/tables/import/staging-store';
import { ShortageCoverageStagingRail } from '@/components/outbound/orders/ShortageCoverageStagingRail';
import { SHORTAGE_COVERAGE_STAGING_TABLE_BINDING } from '@/components/outbound/orders/shortage-coverage-staging/shortage-coverage-staging-table-definition';
import { useShortageCoverageImportTableLayout } from '@/components/outbound/orders/shortage-coverage-staging/useShortageCoverageImportTableLayout';
import {
  ShortageCoverageStagingGridRow,
  shortageCoverageStagingRowKey,
} from '@/components/outbound/orders/shortage-coverage-staging/ShortageCoverageStagingGridRow';
import {
  shortageCoverageStagingSheetColumnsFor,
  shortageCoverageStagingSortFactFor,
  defaultDirForShortageCoverageStagingColumn,
  isShortageCoverageStagingColumnSortable,
  type ShortageCoverageStagingGridColumn,
  type ShortageCoverageStagingGridColumnKey,
} from '@/components/outbound/orders/shortage-coverage-staging/shortage-coverage-staging-grid-layout';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { refreshDomain } from '@/lib/refresh/bus';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

const SHORTAGE_COVERAGE_STAGING_SELECTION_SCOPE = 'shortage-coverage-staging';

const SURFACE = SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.surfaceId;

const STATUS_FILTERS: { id: TableImportFilter; label: string }[] = [
  { id: 'all', label: 'All rows' },
  { id: 'ready', label: 'Ready' },
  { id: 'action_required', label: 'Action required' },
];

function compareStagingRows(
  a: ShortageCoverageImportRowView,
  b: ShortageCoverageImportRowView,
  fact: string,
  dir: 'asc' | 'desc',
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'shortage-coverage-import.order':
      return sign * a.orderNumber.localeCompare(b.orderNumber);
    case 'status':
      return sign * (Number(a.status === 'ready') - Number(b.status === 'ready'));
    case 'shortage-coverage-import.title':
      return sign * a.itemTitle.localeCompare(b.itemTitle);
    case 'shortage-coverage-import.qty':
      return sign * ((Number(a.shortQty) || 0) - (Number(b.shortQty) || 0));
    case 'shortage-coverage-import.coverage':
      return sign * a.coverageLabel.localeCompare(b.coverageLabel);
    case 'shortage-coverage-import.po':
      return sign * a.poNumber.localeCompare(b.poNumber);
    case 'shortage-coverage-import.inbound':
      return sign * a.inboundTracking.localeCompare(b.inboundTracking);
    default:
      return 0;
  }
}

export function ShortageCoverageStagingHost() {
  const draft = useTableImportDraft(SURFACE);
  const { setActive: setStagingActive } = useTableImportParam(SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { effectiveLayout: stagingLayout, fields: stagingFields } =
    useShortageCoverageImportTableLayout();
  const columns = useMemo(
    () => shortageCoverageStagingSheetColumnsFor(stagingLayout),
    [stagingLayout],
  );
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, shortageCoverageStagingSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ShortageCoverageStagingGridColumnKey>({
    isColumn: (raw) => isShortageCoverageStagingColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForShortageCoverageStagingColumn(columns, key),
  });

  const exitStaging = useCallback(() => {
    setStagingActive(false);
    clearTableImportDraft(SURFACE);
  }, [setStagingActive]);

  const allMarked = useMemo(() => {
    if (!draft) return [];
    return markShortageCoverageDuplicates(
      draft.rows.map((row, index) =>
        SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.toRowView(row, draft.mapping, index),
      ),
    );
  }, [draft]);

  const views = useMemo(() => {
    let list = allMarked;
    if (draft?.filter === 'ready') list = list.filter((v) => v.status === 'ready');
    if (draft?.filter === 'action_required') {
      list = list.filter((v) => v.status === 'action_required');
    }
    const needle = draft?.query.trim().toLowerCase() ?? '';
    if (needle) {
      list = list.filter((view) =>
        SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.searchValues(view).some((v) =>
          v.toLowerCase().includes(needle),
        ),
      );
    }
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    if (!sortFact || !sortDir) return list;
    return [...list].sort((a, b) => compareStagingRows(a, b, sortFact, sortDir));
  }, [allMarked, draft, columnSort, sortFactByKey, sortDir]);

  const orderGroupsByDate = useMemo<[string, RowGroup<ShortageCoverageImportRowView>[]][]>(
    () => [['', views.map((row) => ({ key: shortageCoverageStagingRowKey(row), rows: [row] }))]],
    [views],
  );

  const confirmTargets = useMemo(() => {
    if (!draft) return null;
    const readyIndexes = allMarked.filter((v) => v.status === 'ready').map((v) => v.index);
    if (draft.selectedIndexes.size === 0) {
      return { indexes: readyIndexes, scoped: false, skipped: 0 };
    }
    const selectedReady = readyIndexes.filter((i) => draft.selectedIndexes.has(i));
    return {
      indexes: selectedReady,
      scoped: true,
      skipped: draft.selectedIndexes.size - selectedReady.length,
    };
  }, [allMarked, draft]);
  const confirmCount = confirmTargets?.indexes.length ?? 0;

  const selectedIndexes = draft?.selectedIndexes;
  const visibleIndexes = useMemo(() => views.map((v) => v.index), [views]);

  useEffect(() => {
    if (!selectedIndexes) return;
    emitSelection(
      SHORTAGE_COVERAGE_STAGING_SELECTION_SCOPE,
      Array.from(selectedIndexes).map((index) => ({ id: index })),
    );
  }, [selectedIndexes]);

  useEffect(() => {
    emitSelectionTotal(SHORTAGE_COVERAGE_STAGING_SELECTION_SCOPE, visibleIndexes.length);
  }, [visibleIndexes]);

  useEffect(
    () =>
      onToggleAll(SHORTAGE_COVERAGE_STAGING_SELECTION_SCOPE, (mode) => {
        if (mode === 'all') setTableImportSelected(SURFACE, visibleIndexes);
        else clearTableImportSelection(SURFACE);
      }),
    [visibleIndexes],
  );

  const handleConfirm = useCallback(async () => {
    if (!draft || !confirmTargets || confirmTargets.indexes.length === 0) return;
    const { indexes, scoped, skipped } = confirmTargets;
    const noun = `${indexes.length} ready shortage${indexes.length === 1 ? '' : 's'}`;
    const ok = await requestConfirm({
      title: 'Attach coverage to existing Shortage orders?',
      description: skipped > 0
        ? `Update ${noun}. ${skipped} action-required row${skipped === 1 ? '' : 's'} in the selection will be skipped. Orders that do not already exist are skipped — this import never creates orders.`
        : scoped
          ? `Attach coverage on the ${noun} you selected. Existing orders only — nothing is minted.`
          : `Attach coverage on ${noun}. Existing orders only — nothing is minted.`,
      confirmLabel: `Confirm ${indexes.length}`,
      tone: 'primary',
    });
    if (!ok) return;

    setSubmitting(true);
    setSubmitError(null);
    const rows = indexes.map((i) => draft.rows[i]);
    const outcome = await SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.commit({
      rows,
      mapping: draft.mapping,
    });
    setSubmitting(false);
    if (!outcome.ok) {
      setSubmitError(outcome.error);
      return;
    }
    refreshDomain('orders.outbound');
    exitStaging();
  }, [confirmTargets, draft, exitStaging]);

  const handleDiscardSelected = useCallback(() => {
    discardTableImportSelected(SURFACE);
    if ((getTableImportDraft(SURFACE)?.rows.length ?? 0) === 0) {
      exitStaging();
    }
  }, [exitStaging]);

  const handleCancelDraft = useCallback(async () => {
    const ok = await requestConfirm({
      title: 'Leave CSV staging?',
      description: 'This clears the import draft. Nothing has been written to Shortage yet.',
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
          Back to Shortage
        </Button>
      </div>
    );
  }

  const filter = draft.filter;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-card">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border-soft bg-surface-card px-3 py-1">
        <div className="flex min-w-0 items-center gap-2" data-testid="shortage-coverage-staging-identity">
          <FileText className="h-4 w-4 shrink-0 text-text-soft" />
          <span className="truncate text-role-caption font-semibold text-text-default">
            {draft.fileName}
          </span>
          <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            {draft.rows.length} rows
          </span>
        </div>
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
            data-testid="shortage-coverage-staging-confirm"
          >
            {submitting ? 'Updating…' : `Confirm ${confirmCount} ready`}
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

      <div className="min-h-0 flex-1 overflow-hidden" data-testid="shortage-coverage-staging-grid-host">
        <DataTable<
          ShortageCoverageImportRowView,
          ShortageCoverageStagingGridColumnKey,
          ShortageCoverageStagingGridColumn
        >
          binding={SHORTAGE_COVERAGE_STAGING_TABLE_BINDING}
          columns={columns}
          fields={stagingFields}
          orderGroupsByDate={orderGroupsByDate}
          rows={views}
          getRowId={shortageCoverageStagingRowKey}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={false}
          emptyMessage="This file has no rows left to import."
          searchEmptyMessage="No rows match this filter."
          selectionScope={SHORTAGE_COVERAGE_STAGING_SELECTION_SCOPE}
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
                <StagingLeaf key={shortageCoverageStagingRowKey(row)} row={row} columns={visible} />
              ))}
            </>
          )}
          renderRow={(row, _stripe, { columns: visible }) => (
            <StagingLeaf row={row} columns={visible} />
          )}
        />
      </div>

      <ShortageCoverageStagingRail onDiscardSelected={handleDiscardSelected} />
    </div>
  );
}

function StagingLeaf({
  row,
  columns,
}: {
  row: ShortageCoverageImportRowView;
  columns: readonly ShortageCoverageStagingGridColumn[];
}) {
  const draft = useTableImportDraft(SURFACE);
  return (
    <ShortageCoverageStagingGridRow
      row={row}
      checked={Boolean(draft?.selectedIndexes.has(row.index))}
      focused={draft?.focusRowIndex === row.index}
      onToggle={(index: number) => toggleTableImportSelected(SURFACE, index)}
      onOpen={(index: number) => setTableImportFocusRow(SURFACE, index)}
      columns={columns}
    />
  );
}
