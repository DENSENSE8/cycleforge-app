'use client';

/**
 * Inventory › Replenish › **Need to order** — every active purchasing request
 * as the one-row triage list (`TriageCardList density="row"`, owner
 * 2026-09-28): state · SKU · item · vendor · order qty · stock · orders
 * waiting → the plan's next step. Find (`?rsku=`) and Status (`?rstatus=`) are
 * the sidebar's, narrowed on the server (`/api/need-to-order`). The open
 * request reads in the record plane (In place / Split) as
 * `ReplenishmentPlanEvidence`; checked planned requests become draft POs.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import {
  RecordLedgerSummaryPane,
  RecordLedgerTally,
} from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageRowKeyId } from '@/design-system/components/triage-card-list/triage-row-id';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { REPLENISHMENT_RECORD_STATE } from '@/design-system/tokens/replenishment';
import type { RowGroup } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { ReplenishmentRequestStatus } from '@/lib/replenishment-request-status';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { INVENTORY_REPLENISH_VIEW } from '@/lib/triage/views';
import { ReplenishmentPlanEvidence, replenishmentPlanSummary, type ReplenishmentPlanPatch } from './ReplenishmentPlanEvidence';
import { ACTIVE_STATUSES, numText, type NeedToOrderRow } from './replenish-types';

const VIEW = INVENTORY_REPLENISH_VIEW;

/** No chips: Status (`?rstatus=`) and Find (`?rsku=`) are the sidebar's, narrowed on the server. */
const NO_CHIPS: readonly never[] = [];

const NEXT_ACTION: Readonly<Record<NeedToOrderRow['status'], string>> = {
  detected: 'Review',
  pending_review: 'Plan PO',
  planned_for_po: 'Create PO',
  po_created: 'Await receipt',
  waiting_for_receipt: 'Receive',
  fulfilled: 'Complete',
  cancelled: 'Closed',
};

/** A request's id is a UUID; the face speaks numbers (a deterministic hash — rows render on the server too). */
const replenishRowId = (row: NeedToOrderRow): number => triageRowKeyId(row.id);

type ReplenishRowModel = { key: string; ids: readonly number[]; lead: NeedToOrderRow };

interface ReplenishmentNeedTableProps {
  skuSearch: string;
  statusFilter: string | null;
}

export function ReplenishmentNeedTable({ skuSearch, statusFilter }: ReplenishmentNeedTableProps) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creatingPo, setCreatingPo] = useState(false);
  const statuses = statusFilter && ACTIVE_STATUSES.includes(statusFilter as ReplenishmentRequestStatus)
    ? statusFilter
    : ACTIVE_STATUSES.join(',');
  const queryKey = ['replenish-need', { statuses, skuSearch }] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ status: statuses, limit: '200', sort: 'fifo' });
      if (skuSearch) params.set('sku', skuSearch);
      const response = await fetch(`/api/need-to-order?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load purchasing plan');
      const payload = await response.json() as { items?: NeedToOrderRow[]; total?: number };
      return {
        rows: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total ?? 0),
      };
    },
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<NeedToOrderRow>[]][]>(
    () => (rows.length ? [['plan', rows.map((row) => ({ key: row.id, rows: [row] }))]] : []),
    [rows],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const openRow = useMemo(
    () => rows.find((row) => row.id === openId) ?? null,
    [openId, rows],
  );

  // A request that left the plan (created PO, filtered out) closes its record.
  useEffect(() => {
    if (openId && query.data && !rows.some((row) => row.id === openId)) setOpenId(null);
  }, [openId, query.data, rows]);

  const open = useCallback((row: NeedToOrderRow) => {
    setOpenId(row.id);
  }, []);
  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  usePublishRecordCursor({
    surfaceId: 'replenishment-purchasing-plan',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRow ? replenishRowId(openRow) : null,
    getId: replenishRowId,
    onOpen: open,
    onClose: close,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['replenish-need'] });
    refreshDomain('replenish');
  }, [queryClient]);

  const save = useCallback(async (row: NeedToOrderRow, patch: ReplenishmentPlanPatch) => {
    setSavingId(row.id);
    try {
      const response = await fetch(`/api/need-to-order/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => null) as { error?: string; details?: string } | null;
      if (!response.ok) throw new Error(payload?.details || payload?.error || 'Update failed');
      await refresh();
      toast.success('Purchasing plan saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  }, [refresh]);

  const transition = useCallback(async (
    row: NeedToOrderRow,
    status: ReplenishmentRequestStatus,
  ) => {
    await save(row, { status });
  }, [save]);

  const selection = useLocalTriageSelection(replenishRowId);
  const plannedIds = useMemo(
    () => rows
      .filter((row) => selection.ids.has(replenishRowId(row)) && row.status === 'planned_for_po')
      .map((row) => row.id),
    [rows, selection.ids],
  );
  const { setAll } = selection;
  const createDraftPos = useCallback(async () => {
    if (plannedIds.length === 0) return;
    setCreatingPo(true);
    try {
      const response = await fetch('/api/replenish/bulk-create-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replenishment_request_ids: plannedIds }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        purchase_orders?: Array<{ order_number: string }>;
      } | null;
      if (!response.ok) throw new Error(payload?.error || 'Draft PO creation failed');
      setAll(false);
      await refresh();
      const count = payload?.purchase_orders?.length ?? 0;
      toast.success(count === 1 ? 'Created 1 purchase order on Incoming' : `Created ${count} purchase orders on Incoming`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Draft PO creation failed');
    } finally {
      setCreatingPo(false);
    }
  }, [plannedIds, refresh, setAll]);

  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: replenishRowId,
        groupKey: (group: RowGroup<NeedToOrderRow>) => group.key,
        cardModel: (group: RowGroup<NeedToOrderRow>): ReplenishRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [replenishRowId(lead)], lead };
        },
        // A Find naming exactly one request's SKU opens it.
        exactFind: (query: string, model: ReplenishRowModel) => model.lead.sku?.toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<NeedToOrderRow, ReplenishRowModel>) => <ReplenishRow {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<NeedToOrderRow> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    total: query.data?.total,
    loading: query.isLoading,
    fetching: query.isFetching,
    search: { value: skuSearch, pending: false },
    selection,
    open: { id: openRow ? replenishRowId(openRow) : null, open, close },
  };

  const summary = useMemo(() => replenishmentPlanSummary(rows), [rows]);
  const scopeLabel = statusFilter ? statusFilter.replaceAll('_', ' ') : 'Active requests';
  const total = query.data?.total ?? rows.length;

  return (
    <TriageCardList
      density="row"
      family={family}
      feed={feed}
      cut={cut}
      // No chips: Status and Find are the sidebar's.
      summary={null}
      bulk={
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden />}
          disabled={plannedIds.length === 0}
          loading={creatingPo}
          onClick={() => void createDraftPos()}
          title={plannedIds.length === 0 ? 'Only planned requests become draft POs' : undefined}
          data-testid="replenish-create-po"
        >
          Create draft PO{plannedIds.length > 0 ? ` · ${plannedIds.length}` : ''}
        </Button>
      }
      // The scope and the plan's tally ride one line under the bar.
      banner={
        <div className="flex min-w-0 items-center gap-3 pb-2 pl-4" data-testid="replenish-tally">
          <p className="truncate text-sm first-letter:uppercase text-text-muted">
            {scopeLabel}
            {total > rows.length ? ` · first ${rows.length} of ${total}` : ''}
          </p>
          <span className="ml-auto flex">
            <RecordLedgerTally summary={summary} />
          </span>
        </div>
      }
      searchEmpty={
        query.isError ? (
          <p className="text-sm text-text-warning">Purchasing plan could not be loaded</p>
        ) : skuSearch || statusFilter ? (
          <p className="text-sm text-text-muted">No requests match — clear the SKU filter or pick another status.</p>
        ) : null
      }
      allClear={
        query.isError ? (
          <TriageAllClear title="Purchasing plan could not be loaded" detail="Refresh to try again." />
        ) : (
          <TriageAllClear title="No active purchasing requests" detail="Requests land here when stock runs short." />
        )
      }
      record={{
        title: openRow ? (openRow.sku || openRow.item_name || 'Purchasing request') : 'Purchasing request',
        subtitle: openRow?.sku ? openRow.item_name : undefined,
        actions: openRow ? <LifecycleCode state={REPLENISHMENT_RECORD_STATE[openRow.status]} /> : undefined,
        noun: VIEW.noun.one,
        testId: 'replenish-record',
        summary: <RecordLedgerSummaryPane summary={summary} />,
        strip: null,
        view: openRow ? (
          <DeskRecordLayout
            main={
              <ReplenishmentPlanEvidence
                row={openRow}
                saving={savingId === openRow.id}
                onSave={save}
                onTransition={transition}
              />
            }
          />
        ) : null,
      }}
    />
  );
}

/** One request as a row: state · SKU · item · vendor · order qty · stock · waiting → next step. */
const ReplenishRow = memo(function ReplenishRow(props: TriageCardSlotProps<NeedToOrderRow, ReplenishRowModel>) {
  const row = props.model.lead;
  const face = useMemo<TriageRowFace>(() => {
    const state = REPLENISHMENT_RECORD_STATE[row.status];
    const title = row.item_name || 'Unknown item';
    const handle = row.sku || 'No SKU';
    const waiting = Array.isArray(row.orders_waiting) ? row.orders_waiting.length : 0;
    const stock = Number(row.stock_available || 0);
    const incoming = Number(row.stock_incoming || 0);
    const need = numText(row.quantity_needed);
    const orderQty = numText(row.quantity_to_order || row.quantity_needed);
    return {
      state,
      identity: handle,
      title,
      facts: [
        { id: 'vendor', value: row.vendor_name || 'No vendor', width: 'code', tone: row.vendor_name ? 'default' : 'muted', tip: row.vendor_name ?? undefined },
        { id: 'qty', label: 'Order', value: orderQty, width: 'num', tip: `Need ${need} · order ${orderQty}` },
        {
          id: 'stock',
          label: 'Stock',
          value: incoming > 0 ? `${stock} + ${incoming} in` : String(stock),
          width: 'short',
          tone: stock > 0 ? 'default' : 'warn',
          tip: `${stock} available · ${incoming} incoming`,
        },
        {
          id: 'waiting',
          value: waiting > 0 ? `${waiting} waiting` : null,
          width: 'short',
          tone: 'warn',
          tip: waiting > 0 ? `${waiting} order${waiting === 1 ? '' : 's'} blocked on this SKU` : undefined,
        },
      ],
      next: { label: NEXT_ACTION[row.status], blocked: state.tone === 'danger' || state.tone === 'warning' },
      aria: {
        row: `Purchasing request ${handle}, ${title}, ${state.label}`,
        open: `Open purchasing plan for ${title}`,
        check: `Select ${title}`,
      },
    };
  }, [row]);
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} />;
});
