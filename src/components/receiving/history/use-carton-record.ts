'use client';

/** The carton record's data — ONE read shared by the record view and its action-strip verbs (same query keys, so the two never fetch twice): */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deriveCartonReadiness, type CartonReadiness } from '@/lib/receiving/carton-readiness';
import {
  deriveCartonAlerts,
  deriveCartonSteps,
  type CartonRecordCarton,
  type CartonStep,
} from '@/lib/receiving/carton-record-status';
import type { ReceivingStatusAlert } from '@/lib/receiving/receiving-status-strip';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

async function fetchCarton(receivingId: number, signal?: AbortSignal): Promise<CartonRecordCarton | null> {
  const res = await fetch(`/api/receiving/${receivingId}`, { signal });
  if (!res.ok) throw new Error(`Carton details failed (${res.status})`);
  const json = (await res.json().catch(() => null)) as { receiving?: CartonRecordCarton } | null;
  return json?.receiving ?? null;
}

async function fetchCartonLines(receivingId: number, signal?: AbortSignal): Promise<ReceivingLineRow[]> {
  const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`, { signal });
  if (!res.ok) throw new Error(`Item details failed (${res.status})`);
  const data = (await res.json().catch(() => null)) as { receiving_lines?: ReceivingLineRow[] } | null;
  return Array.isArray(data?.receiving_lines) ? data.receiving_lines : [];
}

/** The record's handle: `PO …`, else `Carton …`. */
export function cartonRecordTitle(row: ReceivingLineRow): string {
  const po = (row.zoho_purchaseorder_number || row.source_order_id || '').trim();
  return po ? `PO ${po}` : `Carton ${row.receiving_id ?? row.id}`;
}

export interface CartonRecord {
  receivingId: number;
  carton: CartonRecordCarton | null;
  /** Every line of the carton; the opened row stands in until they land. */
  lines: readonly ReceivingLineRow[];
  /** Real item lines (negative ids are carton placeholders). */
  itemLines: readonly ReceivingLineRow[];
  /** The opened line, live. */
  live: ReceivingLineRow;
  poNumber: string | null;
  tracking: string | null;
  carrier: string | null;
  /** `PO …` / `Carton …` — names the carton in verbs and composers. */
  recordLabel: string;
  readiness: CartonReadiness | null;
  steps: CartonStep[];
  alerts: ReceivingStatusAlert[];
  unfound: boolean;
  linesLoading: boolean;
  loadFailed: boolean;
  refresh: () => void;
}

/** Null when nothing is open or the row has no carton (the strip's host calls this unconditionally). */
export function useCartonRecord(row: ReceivingLineRow | null): CartonRecord | null {
  const receivingId = Number(row?.receiving_id);
  const enabled = row != null && Number.isFinite(receivingId) && receivingId > 0;
  const queryClient = useQueryClient();

  const cartonQuery = useQuery({
    queryKey: ['carton-record', receivingId] as const,
    queryFn: ({ signal }) => fetchCarton(receivingId, signal),
    staleTime: 10_000,
    enabled,
  });
  const linesQuery = useQuery({
    queryKey: ['carton-record-lines', receivingId] as const,
    queryFn: ({ signal }) => fetchCartonLines(receivingId, signal),
    staleTime: 10_000,
    enabled,
  });
  const carton = cartonQuery.data ?? null;
  const lines = useMemo(
    () => (linesQuery.data && linesQuery.data.length > 0 ? linesQuery.data : row ? [row] : []),
    [linesQuery.data, row],
  );
  const itemLines = useMemo(() => lines.filter((line) => line.id > 0), [lines]);
  const live = (row && lines.find((line) => line.id === row.id)) ?? row;

  const poNumber = (carton?.zoho_purchaseorder_number || live?.zoho_purchaseorder_number || '').trim() || null;
  const readiness = useMemo(
    () =>
      carton
        ? deriveCartonReadiness(
            {
              tracking_scanned_at: carton.tracking_scanned_at ?? null,
              unboxed_at: carton.unboxed_at ?? null,
              received_at: carton.received_at ?? null,
            },
            itemLines,
          )
        : null,
    [carton, itemLines],
  );
  const steps = useMemo(() => deriveCartonSteps(carton, lines), [carton, lines]);
  const alerts = useMemo(() => deriveCartonAlerts(carton, lines, poNumber), [carton, lines, poNumber]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['carton-record', receivingId] });
    void queryClient.invalidateQueries({ queryKey: ['carton-record-lines', receivingId] });
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
  }, [queryClient, receivingId]);

  if (!enabled || !live) return null;
  return {
    receivingId,
    carton,
    lines,
    itemLines,
    live,
    poNumber,
    tracking: (carton?.tracking || live.tracking_number || '').trim() || null,
    carrier: (carton?.carrier || live.carrier || '').trim() || null,
    recordLabel: poNumber ? `PO ${poNumber}` : `Carton ${receivingId}`,
    readiness,
    steps,
    alerts,
    unfound: alerts.some((alert) => alert.key === 'unfound'),
    linesLoading: linesQuery.isLoading,
    loadFailed: cartonQuery.isError || linesQuery.isError,
    refresh,
  };
}
