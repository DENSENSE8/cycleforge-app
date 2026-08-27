'use client';

/**
 * Incoming returns CSV/TSV staging — desk-centre triage grid.
 *
 * Ready / Action-required rows from {@link INBOUND_RETURNS_IMPORT_DESCRIPTOR}.
 * Confirm writes through `POST /api/receiving/inbound/import-csv`, then lands
 * Pipeline on `?inkind=return`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { WorkbenchFilterPopover } from '@/components/dashboard/workbench-filter-popover';
import {
  INBOUND_RETURNS_IMPORT_DESCRIPTOR,
  type InboundReturnsImportRowView,
} from '@/lib/inbound/inbound-returns-import-descriptor';
import {
  postCsvInboundReturnsImport,
  type CsvInboundReturnsKey,
} from '@/lib/inbound/csv-inbound-returns-import';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  clearTableImportDraft,
  listTableImportRows,
  setTableImportFilter,
  setTableImportFocusRow,
  setTableImportQuery,
  summarizeTableImportDraft,
  tableImportConfirmTargets,
  updateTableImportRow,
  useTableImportDraft,
  type TableImportFilter,
} from '@/lib/tables/import/staging-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';

const SURFACE = INBOUND_RETURNS_IMPORT_DESCRIPTOR.surfaceId;

const COLUMNS: {
  key: keyof InboundReturnsImportRowView;
  label: string;
  field?: CsvInboundReturnsKey;
}[] = [
  { key: 'status', label: 'Status' },
  { key: 'orderId', label: 'Order', field: 'order_id' },
  { key: 'sku', label: 'SKU', field: 'sku' },
  { key: 'asin', label: 'ASIN', field: 'asin' },
  { key: 'itemName', label: 'Title', field: 'item_name' },
  { key: 'trackingNumber', label: 'Tracking', field: 'tracking_number' },
  { key: 'rmaId', label: 'RMA', field: 'rma_id' },
  { key: 'returnReason', label: 'Reason', field: 'return_reason' },
];

const FILTER_OPTIONS: { id: TableImportFilter; label: string }[] = [
  { id: 'all', label: 'All rows' },
  { id: 'ready', label: 'Ready' },
  { id: 'action_required', label: 'Action required' },
];

export function IncomingReturnsImportStagingHost() {
  const draft = useTableImportDraft(SURFACE);
  const { setActive } = useTableImportParam(INBOUND_RETURNS_IMPORT_DESCRIPTOR);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [committing, setCommitting] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [postCommitHref, setPostCommitHref] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{
    index: number;
    field: CsvInboundReturnsKey;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Drop the session draft only after soft-replace removed `?import=csv`, so the
  // desk's "stale import URL" effect cannot race and wipe `?inkind=return`.
  useEffect(() => {
    if (!postCommitHref) return;
    if (searchParams.get('import') === 'csv') return;
    clearTableImportDraft(SURFACE);
    setPostCommitHref(null);
  }, [postCommitHref, searchParams]);

  const rows = useMemo(
    () => (draft ? listTableImportRows(INBOUND_RETURNS_IMPORT_DESCRIPTOR, draft) : []),
    [draft],
  );
  const summary = useMemo(
    () => (draft ? summarizeTableImportDraft(INBOUND_RETURNS_IMPORT_DESCRIPTOR, draft) : null),
    [draft],
  );
  const confirmIndexes = useMemo(
    () =>
      draft
        ? tableImportConfirmTargets(INBOUND_RETURNS_IMPORT_DESCRIPTOR, draft).indexes
        : [],
    [draft],
  );
  const confirmCount = confirmIndexes.length;

  const leaveStaging = useCallback(() => {
    clearTableImportDraft(SURFACE);
    setActive(false);
  }, [setActive]);

  const handleConfirm = useCallback(async () => {
    if (!draft || confirmCount === 0 || committing) return;
    setCommitting(true);
    try {
      const { indexes } = tableImportConfirmTargets(
        INBOUND_RETURNS_IMPORT_DESCRIPTOR,
        draft,
      );
      const outcome = await postCsvInboundReturnsImport({
        rows: indexes.map((i) => draft.rows[i]),
        mapping: draft.mapping,
      });
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      invalidateReceivingFeeds(queryClient);
      const { created, updated, skipped, failed } = outcome.result;
      toast.success(
        `Imported ${created + updated} · Skipped ${skipped} · Failed ${failed}`,
      );
      const params = new URLSearchParams(searchParams.toString());
      params.delete('import');
      params.set('inkind', 'return');
      params.delete('page');
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname || '/incoming';
      setPostCommitHref(href);
      router.replace(href, { scroll: false });
    } finally {
      setCommitting(false);
    }
  }, [draft, confirmCount, committing, queryClient, router, pathname, searchParams]);

  const startEdit = (
    index: number,
    field: CsvInboundReturnsKey,
    current: string,
  ) => {
    setEditCell({ index, field });
    setEditValue(current);
  };

  const commitEdit = () => {
    if (!editCell || !draft) return;
    updateTableImportRow(INBOUND_RETURNS_IMPORT_DESCRIPTOR, editCell.index, {
      [editCell.field]: editValue,
    });
    setEditCell(null);
  };

  if (!draft || !summary) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-role-caption text-text-soft">
        No import draft — choose a CSV/TSV from Add inbound → Import returns.
      </div>
    );
  }

  const refineLabel =
    draft.filter === 'all'
      ? 'Refine'
      : draft.filter === 'ready'
        ? 'Refine (Ready active)'
        : 'Refine (Action required active)';

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="incoming-returns-import-staging"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-hairline px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-role-caption font-semibold text-text-default">
            Import returns · {draft.fileName}
          </p>
          <p className="text-role-micro text-text-soft">
            {summary.ready} ready · {summary.actionRequired} action required ·{' '}
            {summary.total} total
          </p>
        </div>
        <WorkbenchFilterPopover
          open={refineOpen}
          onOpenChange={setRefineOpen}
          hot={draft.filter !== 'all'}
          label={refineLabel}
        >
          <div className="flex flex-col gap-0.5 p-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  'rounded-none px-3 py-1.5 text-left text-role-caption',
                  draft.filter === opt.id
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-text-default hover:bg-surface-hover',
                )}
                onClick={() => {
                  setTableImportFilter(SURFACE, opt.id);
                  setRefineOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </WorkbenchFilterPopover>
        <TechRailSearchBar
          variant="chrome"
          value={draft.query}
          onChange={(q) => setTableImportQuery(SURFACE, q)}
          placeholder="Filter staging rows…"
          className="min-w-[12rem] max-w-xs flex-1"
        />
        <Button variant="ghost" size="sm" onClick={leaveStaging}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={confirmCount === 0 || committing}
          onClick={() => void handleConfirm()}
          data-testid="csv-import-staging-confirm"
        >
          {committing ? 'Importing…' : `Confirm ${confirmCount} ready`}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table
          className="w-full min-w-[64rem] border-collapse text-left"
          aria-label="CSV import staging rows"
        >
          <thead className="sticky top-0 z-10 bg-surface-card">
            <tr className="border-b border-border-hairline text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
              <th className="px-2 py-2">#</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((view) => (
              <tr
                key={view.index}
                data-staging-row
                data-staging-status={view.status}
                className={cn(
                  'border-b border-border-hairline text-role-caption',
                  draft.focusRowIndex === view.index && 'bg-blue-50/60',
                )}
                onClick={() => setTableImportFocusRow(SURFACE, view.index)}
              >
                <td className="px-2 py-1.5 font-mono text-text-faint">
                  {view.index + 1}
                </td>
                {COLUMNS.map((col) => {
                  if (col.key === 'status') {
                    return (
                      <td key={col.key} className="px-2 py-1.5">
                        <span
                          className={cn(
                            'inline-flex px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-wider',
                            view.status === 'ready'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-800',
                          )}
                        >
                          {view.status === 'ready' ? 'Ready' : 'Action required'}
                        </span>
                      </td>
                    );
                  }
                  const value = String(view[col.key] ?? '');
                  const field = col.field;
                  const editing =
                    editCell?.index === view.index && editCell.field === field;
                  if (!field) {
                    return (
                      <td
                        key={col.key}
                        className="max-w-[12rem] truncate px-2 py-1.5"
                      >
                        {value || '—'}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className="max-w-[14rem] px-2 py-1.5">
                      {editing ? (
                        <input
                          autoFocus
                          className="w-full border border-border-soft bg-surface-card px-1 py-0.5 font-mono text-role-caption outline-none"
                          value={editValue}
                          aria-label={`Edit ${col.label} for staging row ${view.index + 1}`}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit();
                            }
                            if (e.key === 'Escape') setEditCell(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="block w-full truncate text-left hover:underline"
                          aria-label={`Edit ${col.label.toLowerCase()} for staging row ${view.index + 1}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTableImportFocusRow(SURFACE, view.index);
                            startEdit(view.index, field, value);
                          }}
                        >
                          {value || <span className="text-text-faint">—</span>}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-role-caption text-text-soft">
            No rows match this refine / filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
