'use client';

import { useMemo } from 'react';
import { Button } from '@/design-system/primitives';
import { ProductThumb } from '@/features/prepack/prepack-ui';
import { qcLabelHandle, type QcLabelRow } from '@/lib/labels/qc-label-row';

/**
 * Desk prepack, right pane: printed labels, newest first — one row per label,
 * so a package's serials collapse into its one package label. Clicking a row
 * loads that label's product into the form.
 */
export function PrepackPrintedColumn({ rows, onChoose }: { rows: readonly QcLabelRow[]; onChoose: (catalogId: number) => void }) {
  const labels = useMemo(() => {
    const seen = new Set<string>();
    const out: QcLabelRow[] = [];
    for (const row of [...rows].sort((a, b) => b.last_printed_at.localeCompare(a.last_printed_at))) {
      const key = row.package_uid ?? `unit-${row.serial_unit_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      if (out.length === 12) break;
    }
    return out;
  }, [rows]);

  return (
    <aside
      className="hidden min-h-0 min-w-0 overflow-y-auto border-l border-mode-rule bg-surface-card xl:block"
      aria-label="Recently printed labels"
      data-testid="prepack-printed-column"
    >
      <div className="sticky top-0 z-10 border-b border-mode-rule bg-surface-card px-4 py-3">
        <h2 className="text-role-data font-semibold text-mode-ink">Recently printed</h2>
        <p className="text-role-caption text-text-muted">Package labels, newest first — click one to load its product</p>
      </div>
      <ul className="divide-y divide-mode-rule">
        {labels.map((row) => (
          <li key={row.package_uid ?? `unit-${row.serial_unit_id}`}>
            <Button
              variant="ghost"
              size="lg"
              radius="flush"
              className="h-auto min-h-14 w-full items-center justify-start gap-3 whitespace-normal px-4 py-3 text-left"
              disabled={row.sku_catalog_id == null}
              onClick={() => row.sku_catalog_id != null && onChoose(row.sku_catalog_id)}
              data-testid="prepack-printed-row"
              data-catalog-id={row.sku_catalog_id ?? ''}
            >
              <ProductThumb src={row.image_url} title={row.title} />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="break-all font-mono text-role-caption font-semibold text-mode-ink">
                  {row.package_uid ?? qcLabelHandle(row)}
                </span>
                <span className="line-clamp-2 text-role-caption text-text-muted">
                  {row.sku ? `${row.sku} · ` : ''}{row.title || 'Untitled product'}
                </span>
                <span className="text-role-eyebrow text-text-muted">
                  {row.package_serial_count && row.package_serial_count > 1 ? `${row.package_serial_count} serials · ` : ''}
                  {row.last_printed_at ? new Date(row.last_printed_at).toLocaleString() : 'Print time unavailable'}
                </span>
              </span>
            </Button>
          </li>
        ))}
        {labels.length === 0 ? <li className="px-4 py-3 text-role-caption text-text-muted">No labels printed yet.</li> : null}
      </ul>
    </aside>
  );
}
