'use client';

import { useMemo } from 'react';
import { StaffAvatar } from '@/components/identity';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { ItemRecordThumb } from '@/design-system/components/item-record';
import {
  packingReportMatchesQuery,
  type PackingReportRow,
} from '@/lib/packing/packing-report-shared';
import { formatDuration } from '@/lib/studio/flow-metrics';
import {
  platformMetaBrandDot,
  sourcePlatformLabel,
  sourcePlatformMeta,
} from '@/lib/source-platform';
import { formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

function DurationValue({ seconds, quiet = false }: { seconds: number | null; quiet?: boolean }) {
  return (
    <span className={cn('font-mono text-role-data font-semibold tabular-nums', quiet ? 'text-text-muted' : 'text-text-default')}>
      {seconds == null ? '—' : formatDuration(seconds)}
    </span>
  );
}

export function PackerDayAnalyticsTable({
  rows,
  loading,
  query,
}: {
  rows: readonly PackingReportRow[];
  loading: boolean;
  query: string;
}) {
  const visibleRows = useMemo(
    () => rows.filter((row) => packingReportMatchesQuery(row, query)),
    [rows, query],
  );

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm"
      aria-label="Packer day records"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
        <div>
          <h2 className="text-role-body font-semibold text-text-default">Packing records</h2>
          <p className="text-role-micro text-text-soft">
            {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} packs
            {query.trim() ? ' match Find' : ''}
          </p>
        </div>
        <p className="hidden text-right text-role-micro text-text-soft md:block">
          Pack time uses the captured session when available, otherwise the completion cycle
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm">
            <tr className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-soft">
              <th className="border-b border-border-soft px-4 py-2.5">Packed</th>
              <th className="border-b border-border-soft px-3 py-2.5">Product</th>
              <th className="border-b border-border-soft px-3 py-2.5">Order / tracking</th>
              <th className="border-b border-border-soft px-3 py-2.5 text-right">Qty</th>
              <th className="border-b border-border-soft px-3 py-2.5">Packer</th>
              <th className="border-b border-border-soft px-3 py-2.5 text-right">Pack time</th>
              <th className="border-b border-border-soft px-3 py-2.5 text-right">Next pack</th>
              <th className="border-b border-border-soft px-4 py-2.5 text-right">SKU standard</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const platformMeta = sourcePlatformMeta(row.platform);
              const platformLabel = sourcePlatformLabel(row.platform);
              return (
                <tr
                  key={row.salId}
                  className="group transition-colors hover:bg-surface-hover"
                  data-packing-report-row={row.salId}
                >
                  <td className="border-b border-border-hairline px-4 py-3 align-middle">
                    <span className="font-mono text-role-data font-semibold tabular-nums text-text-default">
                      {formatStageClockTimePST(row.packedAt)}
                    </span>
                  </td>
                  <td className="max-w-[360px] border-b border-border-hairline px-3 py-2 align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <ItemRecordThumb
                        imageUrl={row.imageUrl}
                        plainEmpty
                        className="h-12 min-h-12 w-12 rounded-lg border border-border-hairline bg-surface-sunken"
                        iconClassName="h-5 w-5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-role-data font-semibold text-text-default">
                          {row.productTitle?.trim() || 'Unpaired product'}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-role-micro text-text-soft">
                          {row.sku || 'No SKU'}{row.itemNumber ? ` · ${row.itemNumber}` : ''}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-border-hairline px-3 py-2 align-middle">
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <BrandIdentityDot {...platformMetaBrandDot(platformMeta)} />
                        {row.orderNumber ? (
                          <OrderIdChip
                            value={row.orderNumber}
                            dense
                            plain
                            platformLabel={platformLabel}
                            fitDisplayWidth
                            truncateDisplay={false}
                          />
                        ) : (
                          <span className="text-role-data text-text-faint">No order</span>
                        )}
                      </span>
                      {row.trackingOrScanRef ? (
                        <TrackingNumberMenuChip
                          value={row.trackingOrScanRef}
                          plain
                          dense
                          showIcon={false}
                          face="searchable"
                        />
                      ) : (
                        <span className="font-mono text-role-micro text-text-faint">No tracking</span>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-border-hairline px-3 py-3 text-right align-middle font-mono text-role-data font-semibold tabular-nums text-text-default">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="border-b border-border-hairline px-3 py-3 align-middle">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <StaffAvatar
                        staffId={row.packerStaffId}
                        name={row.packerName}
                        size="xs"
                        colorRing
                        alt=""
                      />
                      <span className="max-w-32 truncate text-role-data font-semibold text-text-default">
                        {row.packerName?.trim() || (row.packerStaffId ? `Staff #${row.packerStaffId}` : 'Unassigned')}
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-border-hairline px-3 py-3 text-right align-middle">
                    <DurationValue seconds={row.packDurationSeconds} />
                  </td>
                  <td className="border-b border-border-hairline px-3 py-3 text-right align-middle">
                    <DurationValue seconds={row.nextPackSeconds} quiet />
                  </td>
                  <td className="border-b border-border-hairline px-4 py-3 text-right align-middle">
                    <span className="block font-mono text-role-data font-semibold tabular-nums text-text-default">
                      {row.estimatedMinutes}m
                    </span>
                    <span className="block text-role-micro text-text-soft">
                      {row.packTier.toLowerCase()} · {row.tierSource}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading && rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-role-body text-text-soft">Loading packing records…</p>
        ) : !loading && visibleRows.length === 0 ? (
          <p className="px-4 py-12 text-center text-role-body text-text-soft">
            {query.trim() ? 'No packing records match Find.' : 'No completed packs for this day.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
