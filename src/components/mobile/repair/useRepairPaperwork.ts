'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRepairJson, useRepairRecord, validRepairId } from '@/components/mobile/repair/useRepairWorkbench';
import { qk } from '@/queries/keys';
import { pickupEntry } from '@/lib/repair/repair-history';
import {
  REPAIR_PRINT_DOCUMENT_TITLE,
  type RepairPrintLog,
  type RepairPrintLogEntry,
} from '@/lib/repair/repair-print-log';
import type { StaffPrintRepairPayload } from '@/lib/print/staff-print-bridge';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * Reads behind `/m/rs/[id]/paperwork` and its hub row: the repair, the SKU's
 * manuals (`/api/manuals/resolve`), and the server print log
 * (`/api/repair-service/[id]/print-log`), folded into one document list.
 */

export interface RepairPaperDoc {
  key: string;
  title: string;
  detail: string;
  /** Same-origin view URL; null when the document is not a file (the 2×1 label). */
  openHref: string | null;
  job: StaffPrintRepairPayload;
  lastPrint: RepairPrintLogEntry | null;
}

interface ResolvedManual {
  id: number;
  displayName: string | null;
  productTitle: string | null;
}

function useRepairPrintLog(repairId: number) {
  const query = useQuery({
    queryKey: qk.repairs.workbench(repairId, 'print-log'),
    queryFn: ({ signal }) => fetchRepairJson<RepairPrintLog>(`/api/repair-service/${repairId}/print-log`, signal),
    enabled: validRepairId(repairId),
  });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  return {
    log: query.data ?? null,
    error: query.error ? (query.error as Error).message || 'Failed to load print log' : null,
    reload,
  };
}

const NO_MANUALS: ResolvedManual[] = [];

/** A SKU's manuals change on authoring, not per repair — cached 30 minutes, keyed by SKU. */
function useSkuManuals(sku: string | null) {
  const query = useQuery({
    queryKey: ['manuals', 'resolve', sku] as const,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/manuals/resolve?sku=${encodeURIComponent(sku ?? '')}`, { signal });
      const body = res.ok ? await res.json().catch(() => ({})) : {};
      return Array.isArray(body?.manuals) ? (body.manuals as ResolvedManual[]) : [];
    },
    enabled: Boolean(sku),
    staleTime: 30 * 60 * 1000,
  });
  if (!sku) return NO_MANUALS;
  return query.data ?? null;
}

export function useRepairPaperwork(repairId: number) {
  const { repair, error: repairError, loading } = useRepairRecord(repairId);
  const { log, error: logError, reload: reloadLog } = useRepairPrintLog(repairId);
  const sku = repair?.source_sku?.trim() || null;
  const manuals = useSkuManuals(repair ? sku : null);

  const documents = useMemo<RepairPaperDoc[]>(() => {
    if (!repair) return [];
    const entries = log?.entries ?? [];
    const pickup = pickupEntry(repair);
    const labelPrintedAt = log?.labelPrintedAt ?? repair.label_printed_at ?? null;
    const docs: RepairPaperDoc[] = [
      {
        key: 'receipt',
        title: REPAIR_PRINT_DOCUMENT_TITLE.receipt,
        detail: pickup
          ? `Drop-off + pickup signatures · picked up ${formatMonthDayTimePST(pickup.timestamp)}`
          : 'Drop-off signature · pickup band fills at pickup',
        openHref: `/api/repair-service/print/${repair.id}`,
        job: { repairId: repair.id, document: 'receipt' },
        lastPrint: entries.find((e) => e.document === 'receipt') ?? null,
      },
      {
        key: 'label',
        title: REPAIR_PRINT_DOCUMENT_TITLE.label,
        detail: labelPrintedAt
          ? `2×1 REP-${repair.id} · first printed ${formatMonthDayTimePST(labelPrintedAt)}`
          : `2×1 REP-${repair.id} · never printed`,
        openHref: null,
        job: { repairId: repair.id, document: 'label' },
        lastPrint: entries.find((e) => e.document === 'label') ?? null,
      },
    ];
    for (const manual of manuals ?? []) {
      docs.push({
        key: `manual-${manual.id}`,
        title: manual.displayName || manual.productTitle || `${REPAIR_PRINT_DOCUMENT_TITLE.manual} #${manual.id}`,
        detail: `Manual for ${sku}`,
        openHref: `/api/product-manuals/${manual.id}/content`,
        job: { repairId: repair.id, document: 'manual', manualId: manual.id },
        lastPrint: entries.find((e) => e.document === 'manual' && e.manualId === manual.id) ?? null,
      });
    }
    return docs;
  }, [repair, log, manuals, sku]);

  return {
    repair,
    documents,
    log,
    manualsLoading: repair != null && manuals == null,
    loading,
    error: repairError,
    logError,
    reloadLog,
  };
}

/**
 * Hub row contract: "3 documents · last printed Sep 24, 3:10 PM by Michael".
 * Disabled only when the repair itself cannot be read.
 */
export function useRepairPaperworkRow(repairId: number): { meta: string; enabled: boolean } {
  const { repair, documents, log, loading, error } = useRepairPaperwork(repairId);
  if (!repair) {
    return { meta: loading ? 'Loading…' : error || 'Repair not found', enabled: false };
  }
  const count = `${documents.length} document${documents.length === 1 ? '' : 's'}`;
  const last = log?.entries[0];
  if (!log) return { meta: count, enabled: true };
  if (!last) return { meta: `${count} · nothing printed yet`, enabled: true };
  const who = last.actorName ? ` by ${last.actorName}` : '';
  return { meta: `${count} · last printed ${formatMonthDayTimePST(last.at)}${who}`, enabled: true };
}
