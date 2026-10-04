'use client';

/** `/reports` — Packer day and Task time / activity share one desk frame. */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { getCurrentPSTDateKey } from '@/utils/date';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import { PackerKpiOverview } from '@/components/reports/PackerKpiOverview';
import { PackerDayAnalyticsTable } from '@/components/reports/PackerDayAnalyticsTable';
import { TaskActivityReport } from '@/components/reports/TaskActivityReport';
import { parseReportTab, type ReportTab as Tab } from '@/lib/reports/report-tabs';
import { useNavIntent } from '@/lib/nav/use-nav-intent';

type ReportExportKind = 'packing' | 'inbound' | 'outbound';

/** Packer day — one row per pack, for one PST day. */
function PackerDayReport({
  rows,
  loading,
  find,
  summary,
}: {
  rows: readonly PackingReportRow[];
  loading: boolean;
  find: string;
  summary: PackingKpiSummary | null;
}) {
  const totalMinutes = rows.reduce((sum, r) => sum + r.estimatedMinutes, 0);
  const unpaired = rows.filter((r) => !r.sku).length;
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {summary ? <PackerKpiOverview summary={summary} rows={rows} className="mb-3 shrink-0" /> : null}
      <PackerDayAnalyticsTable rows={rows} loading={loading} query={find} />
      {rows.length > 0 ? (
        <p className="px-3 pt-2 text-role-micro text-text-soft">
          {rows.length} {rows.length === 1 ? 'pack' : 'packs'} · {totalMinutes.toLocaleString()}{' '}
          standard minutes
          {unpaired > 0
            ? ` · ${unpaired} not paired to a catalog SKU, carrying the fallback standard`
            : ''}
          . Standard effort is the saved SKU target; actual session and next-pack pace are shown per row.
        </p>
      ) : null}
    </section>
  );
}

function ReportsPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  /* URL-ADDRESSABLE tabs and date (Track R1). */
  const tab: Tab = parseReportTab(searchParams.get('tab')) ?? 'packer';
  const dateParam = searchParams.get('date');
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getCurrentPSTDateKey();
  const staffRaw = Number(searchParams.get('staffId'));
  const staffId = Number.isInteger(staffRaw) && staffRaw > 0 ? staffRaw : null;
  /* The header's page Find is URL-addressable; Packer day filters the page in hand. */
  const find = searchParams.get('q') ?? '';

  const [rows, setRows] = useState<readonly PackingReportRow[]>([]);
  const [packingKpi, setPackingKpi] = useState<PackingKpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Packer day reads the SAME endpoint as the phone's Packing tab (`/m/reports`) and its CSV export. */
  const load = useCallback(async () => {
    if (tab === 'activity') {
      setLoading(false);
      setError(null);
      setPackingKpi(null);
      return;
    }
    setLoading(true);
    setError(null);
    const packer = staffId == null ? '' : `&packerId=${staffId}`;
    try {
      const [rowsRes, kpiRes] = await Promise.all([
        fetch(`/api/packing/reports/export?format=json&day=${encodeURIComponent(dateKey)}${packer}`, { cache: 'no-store' }),
        fetch(`/api/packing/kpi?day=${encodeURIComponent(dateKey)}${packer}`, { cache: 'no-store' }),
      ]);
      if (!rowsRes.ok) throw new Error(`HTTP ${rowsRes.status}`);
      const body = (await rowsRes.json()) as { ok?: boolean; rows?: PackingReportRow[]; error?: string };
      if (body.ok === false) throw new Error(body.error || 'packing report failed');
      const kpiBody = (await kpiRes.json()) as PackingKpiSummary & { error?: string };
      if (!kpiRes.ok) throw new Error(kpiBody.error || `HTTP ${kpiRes.status}`);
      setRows(body.rows ?? []);
      setPackingKpi(kpiBody);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, dateKey, staffId]);
  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    if (tab === 'activity') void queryClient.invalidateQueries({ queryKey: ['task-activity-report', dateKey] });
    else void load();
  }, [dateKey, load, queryClient, tab]);

  const exportRecords = useCallback((kind: ReportExportKind) => {
    if (kind === 'packing') {
      const query = new URLSearchParams({ day: dateKey, format: 'csv' });
      if (staffId != null) query.set('packerId', String(staffId));
      window.location.assign(`/api/packing/reports/export?${query.toString()}`);
      return;
    }
    const query = new URLSearchParams({ record: kind, day: dateKey });
    if (kind === 'inbound' && staffId != null) query.set('staffId', String(staffId));
    window.location.assign(`/api/reports/records/export?${query.toString()}`);
  }, [dateKey, staffId]);

  useNavIntent('reports:refresh', refresh);
  useNavIntent('reports:export-packing', () => exportRecords('packing'));
  useNavIntent('reports:export-inbound', () => exportRecords('inbound'));
  useNavIntent('reports:export-outbound', () => exportRecords('outbound'));

  /* The desk frame, not a second one (2026-08-31). */
  return (
    <DeskPageLayout bare className="h-full">
      <main className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1800px] flex-1 flex-col px-3 py-3">
        {tab === 'activity' ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TaskActivityReport dateKey={dateKey} />
          </section>
        ) : error ? (
          <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
        ) : (
          <PackerDayReport rows={rows} loading={loading} find={find} summary={packingKpi} />
        )}
      </main>
    </DeskPageLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <LoadingSpinner size="lg" className="text-blue-600" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
