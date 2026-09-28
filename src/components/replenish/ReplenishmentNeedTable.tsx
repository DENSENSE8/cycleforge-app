'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import type { ReplenishmentRequestStatus } from '@/lib/replenishment-request-status';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { ReplenishmentPlanEvidence, replenishmentPlanSummary, type ReplenishmentPlanPatch } from './ReplenishmentPlanEvidence';
import { ReplenishmentPlanRecord } from './ReplenishmentPlanRecord';
import { ACTIVE_STATUSES, type NeedToOrderRow } from './replenish-types';

interface ReplenishmentNeedTableProps {
  skuSearch: string;
  statusFilter: string | null;
}

const replenishmentId = (row: NeedToOrderRow): string => row.id;

export function ReplenishmentNeedTable({ skuSearch, statusFilter }: ReplenishmentNeedTableProps) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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

  const rows = query.data?.rows ?? [];
  const openRow = useMemo(
    () => rows.find((row) => row.id === openId) ?? null,
    [openId, rows],
  );
  const cursorOrder = useMemo<GroupedRenderOrder<NeedToOrderRow>>(
    () => [['plan', [{ key: 'plan', rows }]]],
    [rows],
  );

  useEffect(() => {
    if (openId && !rows.some((row) => row.id === openId)) setOpenId(null);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => rows.some((row) => row.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [openId, rows]);

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
    order: cursorOrder,
    openId,
    getId: replenishmentId,
    onOpen: open,
    onClose: close,
  });
  const navigation = useRecordCursor('record');

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

  const toggle = useCallback((row: NeedToOrderRow) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, []);

  const plannedIds = useMemo(
    () => rows
      .filter((row) => selectedIds.has(row.id) && row.status === 'planned_for_po')
      .map((row) => row.id),
    [rows, selectedIds],
  );
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
      setSelectedIds(new Set());
      await refresh();
      const count = payload?.purchase_orders?.length ?? 0;
      toast.success(count === 1 ? 'Created 1 purchase order on Incoming' : `Created ${count} purchase orders on Incoming`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Draft PO creation failed');
    } finally {
      setCreatingPo(false);
    }
  }, [plannedIds, refresh]);

  const renderRecord = useCallback(
    (row: NeedToOrderRow, isOpen: boolean) => (
      <ReplenishmentPlanRecord
        row={row}
        open={isOpen}
        selected={selectedIds.has(row.id)}
        onOpen={open}
        onToggle={toggle}
      />
    ),
    [open, selectedIds, toggle],
  );
  const summary = useMemo(() => replenishmentPlanSummary(rows), [rows]);

  return (
    <RecordLedger
      testId="replenishment-plan-ledger"
      label="Purchasing plan"
      records={rows}
      recordKey={replenishmentId}
      renderRecord={renderRecord}
      openKey={openId}
      onOpenKey={(id) => {
        const row = rows.find((candidate) => candidate.id === id);
        if (row) open(row);
      }}
      onClose={close}
      loading={query.isLoading}
      navigation={navigation.available ? navigation : undefined}
      toolbar={
        <>
          <span className="mode-label min-w-0 flex-1 truncate px-2 text-mode-muted">
            {statusFilter ? statusFilter.replaceAll('_', ' ').toLowerCase() : 'Active requests'}
          </span>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Plus aria-hidden />}
            disabled={plannedIds.length === 0}
            loading={creatingPo}
            onClick={() => void createDraftPos()}
          >
            Create draft PO{plannedIds.length > 0 ? ` · ${plannedIds.length}` : ''}
          </Button>
        </>
      }
      empty={
        <b className="text-role-body font-bold text-mode-ink">
          {query.isError
            ? 'Purchasing plan could not be loaded'
            : skuSearch
              ? `No requests match “${skuSearch}”`
              : 'No active purchasing requests'}
        </b>
      }
      recordTitle={openRow ? (openRow.sku || openRow.item_name || 'Purchasing request') : 'Purchasing request'}
      recordSubtitle={openRow?.sku ? openRow.item_name : undefined}
      recordNoun="request"
      summary={summary}
      record={
        openRow ? (
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
        ) : null
      }
      footer={
        <>
          <span>{rows.length.toLocaleString()} of {(query.data?.total ?? rows.length).toLocaleString()} requests</span>
          {selectedIds.size > 0 ? <span className="ml-auto">{selectedIds.size.toLocaleString()} selected</span> : null}
        </>
      }
    />
  );
}
