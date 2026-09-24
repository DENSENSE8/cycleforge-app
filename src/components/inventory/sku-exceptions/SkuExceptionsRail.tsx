'use client';

/**
 * SKU-exceptions queue rail — the left column of the record walk.
 *
 * A preset over `SidebarRecentRailBase` (the Unbox / order-exceptions shell),
 * handed the workbench's settled rows. Row id is `stockId`: the shell keys on
 * a number, and `sku_stock.id` is the placeholder's one numeric identity.
 */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import type { RailPeekFact } from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import {
  skuExceptionState,
  skuExceptionTitle,
} from '@/lib/tables/field-catalog/sku-exceptions-resolve';

const SKU_EXCEPTIONS_RAIL_LIMIT = 60;

const statusDot = (row: ProvisionalSku) =>
  skuExceptionState(row) === 'Needs photo' ? 'bg-fill-warning' : 'bg-fill-info';

const facts = (row: ProvisionalSku): RailPeekFact[] => [{ tone: 'sku', value: row.sku }];

export function SkuExceptionsRail({
  rows,
  selectedSku,
  onSelect,
  loading,
}: {
  rows: readonly ProvisionalSku[];
  selectedSku: string | null;
  onSelect: (sku: string) => void;
  loading: boolean;
}) {
  const selectedId = rows.find((row) => row.sku === selectedSku)?.stockId ?? null;
  const version = useMemo(() => rows.map((r) => `${r.sku}:${r.updatedAt ?? ''}`).join('|'), [rows]);
  const queryKey = useMemo(() => ['sku-exceptions.rail', version] as const, [version]);
  const fetchFn = useCallback(async () => [...rows], [rows]);
  const select = useCallback((row: ProvisionalSku) => onSelect(row.sku), [onSelect]);

  return (
    <SidebarRailScrollport>
      <SidebarRecentRailBase<ProvisionalSku>
        queryKey={queryKey}
        fetchFn={fetchFn}
        selectedId={selectedId}
        limit={SKU_EXCEPTIONS_RAIL_LIMIT}
        preserveServerOrder
        pinSelectedLead={false}
        eyebrowTitle="SKU exceptions"
        emptyText={loading ? 'Loading SKU exceptions…' : 'No SKU exceptions'}
        getId={(row) => row.stockId}
        onSelect={select}
        getStatusDot={statusDot}
        getStatusDotLabel={skuExceptionState}
        getCollapsePinLabel={skuExceptionTitle}
        getCollapsePinMeta={(row) => row.sku}
        getCollapsePinFacts={facts}
        navRegionId="left"
        renderRowMain={(row) => (
          <div data-sku-exception-row={row.sku} className="min-w-0 flex-1">
            <RailRowBody
              vm={{
                title: skuExceptionTitle(row),
                titleAttr: skuExceptionTitle(row),
                meta: (
                  <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
                    <span className="truncate text-text-muted">
                      {row.stock} on hand · {row.photoCount} photo{row.photoCount === 1 ? '' : 's'}
                    </span>
                  </span>
                ),
              }}
            />
          </div>
        )}
        renderPopover={(row, { openWorkspace, dismiss }) => (
          <RailPeekCard
            title={skuExceptionTitle(row)}
            statusLabel={skuExceptionState(row)}
            statusDotClass={statusDot(row)}
            meta={row.description?.trim() || undefined}
            facts={facts(row)}
            onOpen={() => {
              openWorkspace();
              dismiss();
            }}
          />
        )}
      />
    </SidebarRailScrollport>
  );
}
