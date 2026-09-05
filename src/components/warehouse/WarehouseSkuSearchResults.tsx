'use client';

import Link from 'next/link';
import type { SkuHit } from '@/hooks/useWarehouseSkuSearch';
import { Panel } from '@/design-system/primitives';


interface WarehouseSkuSearchResultsProps {
  loading: boolean;
  hits: SkuHit[] | null;
  onSelect: () => void;
}

export function WarehouseSkuSearchResults({
  loading,
  hits,
  onSelect,
}: WarehouseSkuSearchResultsProps) {
  if (loading) {
    return (
      <Panel radius="xl" padding="none" className="overflow-hidden">
        <div className="px-3 py-3 text-xs text-text-faint">Searching…</div>
      </Panel>
    );
  }

  if (hits && hits.length === 0) {
    return (
      <Panel radius="xl" padding="none" className="overflow-hidden">
        <div className="px-3 py-3 text-xs text-text-soft">
          No SKUs or products match.
        </div>
      </Panel>
    );
  }

  if (hits && hits.length > 0) {
    return (
      <Panel radius="xl" padding="none" elevation="md" className="overflow-hidden">
        <ul className="max-h-72 divide-y divide-border-hairline overflow-y-auto">
          {hits.map((h) => (
            <li key={h.sku}>
              <Link
                href={`/inventory?sku=${encodeURIComponent(h.sku)}`}
                onClick={onSelect}
                className="flex items-baseline justify-between gap-2 px-3 py-2 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-blue-700">
                    {h.sku}
                  </div>
                  {h.product_title && (
                    <div className="mt-0.5 line-clamp-1 text-role-caption text-text-muted">
                      {h.product_title}
                    </div>
                  )}
                  <div className="mt-0.5 text-role-micro text-text-faint">
                    {h.bin_count} bin{h.bin_count === 1 ? '' : 's'} ·{' '}
                    {h.total_qty} unit{h.total_qty === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-sm font-semibold tabular-nums text-text-default">
                  {h.stock}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }

  return null;
}
