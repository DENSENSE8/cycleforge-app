'use client';

/**
 * Operations Analytics — Packer productivity section with Overview / Charts / By item tabs.
 */

import { useMemo, useState } from 'react';
import { Boxes, Download, ExternalLink, Pencil } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { SectionCard } from '@/design-system/components/monitor';
import { PackProfileEditor } from '@/components/packing/PackProfileEditor';
import type { PackTier } from '@/lib/packing/pack-tier-classifier';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { cn } from '@/utils/_cn';
import { GaugeDonut } from './charts/GaugeDonut';
import { DistributionTable } from './charts/DistributionTable';
import {
  packingBoxesByTierSegments,
  packingBoxesDistributionRows,
  packingCapacitySegments,
  packingMinutesByTierSegments,
} from './packing-kpi-chart-segments';
import type { PackingKpiResponse } from './usePackingKpi';
import { usePackingKpiItems } from './usePackingKpiItems';

type PackingTab = 'overview' | 'charts' | 'by-item';

const PACKING_TABS: { id: PackingTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'by-item', label: 'By item' },
];

function formatPackedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function tierLabel(tier: string): string {
  const t = tier.toUpperCase();
  if (t === 'SMALL') return 'Small';
  if (t === 'MEDIUM') return 'Medium';
  if (t === 'LARGE') return 'Large';
  return tier;
}

function sourceLabel(source: PackingReportRow['tierSource']): string {
  if (source === 'profile') return 'Profile';
  if (source === 'clean') return 'Clean';
  if (source === 'rules') return 'Rules';
  return 'Default';
}

export function PackingKpiSection({
  packing,
  loading,
  exportPackingReport,
}: {
  packing: PackingKpiResponse | null;
  loading: boolean;
  exportPackingReport: (packerId?: number) => void;
}) {
  const [tab, setTab] = useState<PackingTab>('overview');
  const itemsQuery = usePackingKpiItems(packing?.day);
  const items = itemsQuery.data?.ok ? itemsQuery.data.rows : [];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    skuCatalogId: number | null;
    label: string;
    tier: PackTier | null;
    minutes: number | null;
  } | null>(null);

  const packingBoxSegments = useMemo(
    () => (packing ? packingBoxesByTierSegments(packing.totals) : []),
    [packing],
  );
  const packingMinuteSegments = useMemo(
    () => (packing ? packingMinutesByTierSegments(packing.totals) : []),
    [packing],
  );
  const packingCapacityGauge = useMemo(
    () =>
      packing
        ? packingCapacitySegments({
            weightedMinutes: packing.totals.weighted_minutes,
            dailyCapacityMinutes: packing.capacity.daily_capacity_minutes,
          })
        : [],
    [packing],
  );
  const packingBoxRows = useMemo(
    () => (packing ? packingBoxesDistributionRows(packing.totals) : []),
    [packing],
  );
  const packingCapacityPct = useMemo(() => {
    if (!packing) return null;
    const cap = Math.max(1, packing.capacity.daily_capacity_minutes);
    return Math.round((packing.totals.weighted_minutes / cap) * 1000) / 10;
  }, [packing]);

  const openEditor = (row: PackingReportRow) => {
    setEditTarget({
      skuCatalogId: row.skuCatalogId,
      label: [row.itemNumber, row.sku, row.productTitle].filter(Boolean).join(' · ') || 'Pack size',
      tier: (['SMALL', 'MEDIUM', 'LARGE'].includes(row.packTier.toUpperCase())
        ? row.packTier.toUpperCase()
        : null) as PackTier | null,
      minutes: row.estimatedMinutes,
    });
    setEditorOpen(true);
  };

  return (
    <>
      <SectionCard
        stagger
        htmlId="ops-analytics-packing-kpi"
        icon={Boxes}
        eyebrow="Packing"
        title="Packer productivity (weighted)"
        headline={packing ? `${packing.totals.weighted_minutes.toLocaleString()} min` : loading ? '—' : '—'}
        meta={
          packing
            ? `${packing.totals.remaining_minutes.toLocaleString()} min remaining · FBA fill ≈ ${packing.fba.fillable_units.toLocaleString()} units`
            : 'Requires operations permission'
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PackingTabBar value={tab} onChange={setTab} />
            {packing ? (
              <span className="text-xs font-semibold text-text-muted">
                Today · Capacity {packing.capacity.daily_capacity_minutes.toLocaleString()} min ·{' '}
                {packing.capacity.packer_headcount} packers
              </span>
            ) : (
              <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">Today</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={() => exportPackingReport()}
                disabled={!packing}
              >
                Export all
              </Button>
            </div>
          </div>

          {!packing ? (
            <div className="rounded-2xl border border-dashed border-border-soft bg-surface-canvas p-4 text-sm text-text-muted">
              Packing KPI is unavailable (missing permission or no data).
            </div>
          ) : tab === 'overview' ? (
            <OverviewTab packing={packing} exportPackingReport={exportPackingReport} />
          ) : tab === 'charts' ? (
            <ChartsTab
              packing={packing}
              packingBoxSegments={packingBoxSegments}
              packingMinuteSegments={packingMinuteSegments}
              packingCapacityGauge={packingCapacityGauge}
              packingBoxRows={packingBoxRows}
              packingCapacityPct={packingCapacityPct}
            />
          ) : (
            <ByItemTab
              rows={items}
              loading={itemsQuery.isLoading}
              onEdit={openEditor}
            />
          )}
        </div>
      </SectionCard>

      <PackProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        skuCatalogId={editTarget?.skuCatalogId ?? null}
        label={editTarget?.label}
        initialTier={editTarget?.tier}
        initialMinutes={editTarget?.minutes}
      />
    </>
  );
}

function PackingTabBar({
  value,
  onChange,
}: {
  value: PackingTab;
  onChange: (v: PackingTab) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border-soft bg-surface-canvas p-0.5">
      {PACKING_TABS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'ds-raw-button rounded-md px-2.5 py-1 text-role-eyebrow uppercase tracking-widest transition-colors',
            value === o.id ? 'bg-surface-card text-text-default shadow-sm' : 'text-text-soft hover:text-text-default',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OverviewTab({
  packing,
  exportPackingReport,
}: {
  packing: PackingKpiResponse;
  exportPackingReport: (packerId?: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface-canvas divide-y divide-border-soft">
      <div className="grid grid-cols-6 gap-2 px-4 py-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
        <div className="col-span-2">Packer</div>
        <div className="text-right">Small</div>
        <div className="text-right">Medium</div>
        <div className="text-right">Large</div>
        <div className="text-right">Minutes</div>
      </div>
      {packing.by_packer.length === 0 ? (
        <div className="px-4 py-6 text-sm text-text-muted">No packs recorded today.</div>
      ) : (
        packing.by_packer.map((r) => (
          <div key={r.staff_id} className="grid grid-cols-6 gap-2 px-4 py-2 items-center">
            <div className="col-span-2">
              <div className="text-sm font-semibold text-text-default">{r.staff_name || `#${r.staff_id}`}</div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-0.5 h-auto px-0 py-0 text-xs font-semibold text-text-accent hover:opacity-80"
                icon={<Download className="h-3.5 w-3.5" />}
                onClick={() => exportPackingReport(r.staff_id)}
              >
                Download
              </Button>
            </div>
            <div className="text-right tabular-nums text-sm font-semibold text-text-default">{r.small_count}</div>
            <div className="text-right tabular-nums text-sm font-semibold text-text-default">{r.medium_count}</div>
            <div className="text-right tabular-nums text-sm font-semibold text-text-default">{r.large_count}</div>
            <div className="text-right tabular-nums text-sm font-semibold text-text-default">{r.weighted_minutes}</div>
          </div>
        ))
      )}
    </div>
  );
}

function ChartsTab({
  packing,
  packingBoxSegments,
  packingMinuteSegments,
  packingCapacityGauge,
  packingBoxRows,
  packingCapacityPct,
}: {
  packing: PackingKpiResponse;
  packingBoxSegments: ReturnType<typeof packingBoxesByTierSegments>;
  packingMinuteSegments: ReturnType<typeof packingMinutesByTierSegments>;
  packingCapacityGauge: ReturnType<typeof packingCapacitySegments>;
  packingBoxRows: ReturnType<typeof packingBoxesDistributionRows>;
  packingCapacityPct: number | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border-soft bg-surface-canvas p-4">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Boxes by tier</p>
          <GaugeDonut className="mt-2" centerLabel="Boxes" segments={packingBoxSegments} interactive />
          <div className="mt-3">
            <DistributionTable
              columns={['Tier', 'Boxes', '%']}
              rows={packingBoxRows}
              emptyMessage="No boxes packed today."
            />
          </div>
        </div>
        <div className="rounded-2xl border border-border-soft bg-surface-canvas p-4">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Weighted minutes</p>
          <GaugeDonut className="mt-2" centerLabel="Minutes" segments={packingMinuteSegments} interactive />
          <p className="mt-3 text-role-micro leading-5 text-text-soft">
            Small × 5 · Medium × 14 · Large × 45 (estimated pack minutes).
          </p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-surface-canvas p-4">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Day capacity</p>
          <GaugeDonut
            className="mt-2"
            centerLabel="Capacity"
            total={Math.max(1, packing.capacity.daily_capacity_minutes)}
            segments={packingCapacityGauge}
            interactive
          />
          <p className="mt-3 text-role-micro leading-5 text-text-soft">
            {packingCapacityPct != null ? `${packingCapacityPct}% of day · ` : null}
            {packing.totals.weighted_minutes.toLocaleString()} used of{' '}
            {packing.capacity.daily_capacity_minutes.toLocaleString()} min (
            {packing.capacity.packer_headcount} packers).
          </p>
        </div>
      </div>

      {packing.by_packer.length > 0 ? (
        <div className="rounded-2xl border border-border-soft bg-surface-canvas p-4">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">By packer</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {packing.by_packer.map((r) => (
              <div key={r.staff_id} className="flex w-[140px] flex-col items-center">
                <GaugeDonut
                  size={132}
                  thickness={12}
                  centerLabel="Boxes"
                  segments={packingBoxesByTierSegments(r)}
                  interactive
                />
                <p className="mt-1 max-w-full truncate text-center text-xs font-semibold text-text-default">
                  {r.staff_name || `#${r.staff_id}`}
                </p>
                <p className="text-role-micro tabular-nums text-text-soft">
                  {r.weighted_minutes.toLocaleString()} min
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ByItemTab({
  rows,
  loading,
  onEdit,
}: {
  rows: PackingReportRow[];
  loading: boolean;
  onEdit: (row: PackingReportRow) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-border-soft bg-surface-canvas p-4 text-sm text-text-muted">
        Loading packed items…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-soft bg-surface-canvas p-4 text-sm text-text-muted">
        No packed items today.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-soft bg-surface-canvas">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border-soft text-role-eyebrow uppercase tracking-widest text-text-soft">
            <th className="px-3 py-2 font-medium">Packed</th>
            <th className="px-3 py-2 font-medium">Item #</th>
            <th className="px-3 py-2 font-medium">SKU</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Tier</th>
            <th className="px-3 py-2 font-medium text-right">Min</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Packer</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-soft">
          {rows.map((row) => (
            <tr key={row.salId} className="align-middle">
              <td className="px-3 py-2 tabular-nums text-text-muted whitespace-nowrap">
                {formatPackedAt(row.packedAt)}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-default whitespace-nowrap">
                {row.itemNumber || '—'}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-muted whitespace-nowrap">
                {row.sku || '—'}
              </td>
              <td className="px-3 py-2 max-w-[220px] truncate text-text-default" title={row.productTitle ?? undefined}>
                {row.productTitle || '—'}
              </td>
              <td className="px-3 py-2 font-semibold text-text-default whitespace-nowrap">
                {tierLabel(row.packTier)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-default">{row.estimatedMinutes}</td>
              <td className="px-3 py-2 text-text-muted whitespace-nowrap">{sourceLabel(row.tierSource)}</td>
              <td className="px-3 py-2 text-text-default whitespace-nowrap">{row.packerName || '—'}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => onEdit(row)}
                  >
                    {row.skuCatalogId != null ? 'Edit pack size' : 'Link catalog'}
                  </Button>
                  {row.packerLogId != null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ExternalLink className="h-3.5 w-3.5" />}
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.location.href = `/review?packerLogId=${row.packerLogId}`;
                        }
                      }}
                    >
                      Review
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
