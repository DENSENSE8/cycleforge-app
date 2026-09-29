'use client';

/** `/m/reports` — packer KPI summary plus the exact pack-scan backfill. */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from '@/components/Icons';
import { MobileActionSlotRegistrar, MobileTopBarAction } from '@/components/mobile/redesign/MobileActionSlot';
import { MobilePackerKpiOverview } from '@/components/mobile/reports/MobilePackerKpiOverview';
import { Button } from '@/design-system/primitives';
import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { addDaysToDateKey, formatDateKeyMedium, getCurrentPSTDateKey } from '@/utils/date';

type ReportPayload = { summary: PackingKpiSummary; rows: PackingReportRow[] };

export function MobilePackerReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, rowsRes] = await Promise.all([
        fetch(`/api/packing/kpi?day=${encodeURIComponent(date)}`, { cache: 'no-store' }),
        fetch(`/api/packing/reports/export?format=json&day=${encodeURIComponent(date)}`, { cache: 'no-store' }),
      ]);
      const [summaryBody, rowsBody] = await Promise.all([summaryRes.json(), rowsRes.json()]);
      if (!summaryRes.ok) throw new Error(summaryBody?.error || 'Could not load packer KPIs.');
      if (!rowsRes.ok) throw new Error(rowsBody?.error || 'Could not load pack backfill.');
      setPayload({ summary: summaryBody as PackingKpiSummary, rows: rowsBody.rows ?? [] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load packer report.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveDay = (offset: number) => {
    const next = addDaysToDateKey(date, offset);
    router.replace(`/m/reports?date=${encodeURIComponent(next)}`, { scroll: false });
  };

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="mobile-packer-report">
      <MobileActionSlotRegistrar>
        <MobileTopBarAction icon={<RefreshCw className="size-4" />} onClick={() => void load()} disabled={loading}>
          Refresh
        </MobileTopBarAction>
      </MobileActionSlotRegistrar>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-mode-rule">
        <Button variant="ghost" radius="flush" size="lg" onClick={() => moveDay(-1)} className="justify-self-stretch">‹ Earlier</Button>
        <p className="px-2 text-center text-role-caption font-semibold text-mode-ink">
          {date === today ? 'Today' : formatDateKeyMedium(date, { weekday: 'short' })}
        </p>
        <Button variant="ghost" radius="flush" size="lg" disabled={date >= today} onClick={() => moveDay(1)} className="justify-self-stretch">Later ›</Button>
      </div>

      {loading && !payload ? (
        <p className="px-mode-page py-10 text-center text-role-data font-semibold text-mode-muted">Loading packer KPIs…</p>
      ) : error ? (
        <div className="flex flex-col gap-3 border-b border-mode-rule px-mode-page py-5">
          <p className="text-role-caption font-semibold text-text-danger">{error}</p>
          <Button variant="secondary" radius="flush" size="lg" onClick={() => void load()}>Retry</Button>
        </div>
      ) : payload ? (
        <>
          <MobilePackerKpiOverview summary={payload.summary} />
          <section>
            <div className="border-b border-mode-rule px-mode-page py-2">
              <h2 className="text-role-caption font-semibold text-mode-ink">Pack backfill</h2>
              <p className="text-role-micro text-mode-muted">{payload.rows.length} completed pack{payload.rows.length === 1 ? '' : 's'} · exact SKU standard used</p>
            </div>
            {payload.rows.length === 0 ? (
              <p className="border-b border-mode-rule px-mode-page py-8 text-center text-role-data font-semibold text-mode-ink">No completed packs this day.</p>
            ) : (
              <ul className="divide-y divide-mode-rule" aria-label="Pack backfill">
                {payload.rows.map((row) => {
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-role-data font-semibold text-mode-ink">{row.productTitle || row.sku || row.itemNumber || 'Unpaired pack'}</span>
                        <span className="mt-0.5 block truncate font-mono text-role-micro text-mode-muted">
                          {row.sku ? `SKU ${row.sku}` : 'No SKU'}{row.itemNumber ? ` · Item # ${row.itemNumber}` : ''}
                        </span>
                        <span className="mt-0.5 block text-role-micro text-mode-muted">{row.packerName || 'Unknown packer'} · {new Date(row.packedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-role-data font-semibold tabular-nums text-mode-ink">{row.estimatedMinutes} min</span>
                        <span className="block text-role-micro capitalize text-mode-muted">{row.tierSource}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={row.salId}>
                      {row.sku ? (
                        <Link href={`/m/products/${encodeURIComponent(row.sku)}`} className="flex min-h-16 items-center gap-3 px-mode-page py-2 active:bg-mode-ink active:text-mode-panel">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex min-h-16 items-center gap-3 px-mode-page py-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
