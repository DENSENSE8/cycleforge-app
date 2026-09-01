'use client';

/**
 * Paperwork recents rail — same shell as exceptions, different job.
 *
 * Preset over {@link SidebarRecentRailBase}. The walk list is the To-ship
 * subset currently in the run (selection, or the loaded queue).
 */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import type { RailPeekFact } from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import type { ShippedOrder } from '@/types/orders';

const RAIL_LIMIT = 60;

function trackingOf(row: ShippedOrder): string {
  return String(row.shipping_tracking_number || '').trim();
}

function titleOf(row: ShippedOrder): string {
  return row.product_title || row.order_id || `#${row.id}`;
}

function paperworkFacts(row: ShippedOrder): RailPeekFact[] {
  return [
    { tone: 'order', value: row.order_id ?? '' },
    { tone: 'sku', value: row.sku ?? row.item_number ?? '' },
    { tone: 'tracking', value: trackingOf(row) },
  ];
}

export function PaperworkRecentRail({
  rows,
  selectedId,
  onSelect,
  loading,
}: {
  rows: ShippedOrder[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  const version = useMemo(() => rows.map((r) => r.id).join('|'), [rows]);
  const queryKey = useMemo(() => ['paperwork.rail', version] as const, [version]);
  const fetchFn = useCallback(async () => rows, [rows]);
  const select = useCallback((row: ShippedOrder) => onSelect(row.id), [onSelect]);

  return (
    <SidebarRailScrollport>
      <SidebarRecentRailBase<ShippedOrder>
        queryKey={queryKey}
        fetchFn={fetchFn}
        selectedId={selectedId}
        limit={RAIL_LIMIT}
        preserveServerOrder
        eyebrowTitle="Labels"
        emptyText={loading ? 'Loading orders…' : 'No orders in this walk'}
        getId={(row) => row.id}
        onSelect={select}
        getStatusDot={(row) =>
          trackingOf(row) ? 'bg-emerald-500' : 'bg-amber-400'
        }
        getStatusDotLabel={(row) =>
          trackingOf(row) ? 'Tracking linked' : 'Needs a label'
        }
        getCollapsePinLabel={titleOf}
        getCollapsePinMeta={(row) =>
          row.order_id ? `${row.order_id}${row.sku ? ` · ${row.sku}` : ''}` : row.sku
        }
        getCollapsePinFacts={paperworkFacts}
        navRegionId="left"
        renderRowMain={(row, ctx) => (
          <div data-paperwork-row-id={row.id} className="min-w-0 flex-1">
            <RailRowBody
              vm={{
                title: titleOf(row),
                titleAttr: titleOf(row),
                titleAccessory: ctx.pkgChip,
                meta: (
                  <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
                    <span className="truncate text-text-muted">{row.order_id}</span>
                  </span>
                ),
              }}
            />
          </div>
        )}
        renderPopover={(row, { openWorkspace, dismiss }) => (
          <RailPeekCard
            title={titleOf(row)}
            statusLabel={trackingOf(row) ? 'Tracking linked' : 'Needs a label'}
            statusDotClass={trackingOf(row) ? 'bg-emerald-500' : 'bg-amber-400'}
            facts={paperworkFacts(row)}
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
