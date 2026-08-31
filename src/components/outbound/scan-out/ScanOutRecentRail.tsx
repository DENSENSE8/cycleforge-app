'use client';

/**
 * Scan-out recent rail — this staffer's last dock SHIP_CONFIRM scans.
 *
 * A PRESET over {@link SidebarRecentRailBase} (same recipe as Exceptions /
 * Pack recent). Rows come from `GET /api/orders/recent?staff=` (session staff).
 * Selecting a row focuses the carton workbench via `scan-out-active-changed`.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import type { RailPeekFact } from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import {
  getShippedOutStatusDot,
  getShippedOutStatusDotLabel,
  shippedOutRailTitle,
  shippedOutToDenseRailVM,
} from '@/components/sidebar/shipping/shipped-out-rail-vm';
import {
  recentOrderToShippedRow,
  type RecentOrderRow,
  type ShippedHistoryRow,
} from '@/lib/shipping/shipping-rail-shared';
import {
  SCAN_OUT_CONFIRMED_EVENT,
  dispatchScanOutActive,
  type ScanOutActivePane,
} from '@/components/outbound/scan-out/scan-out-active';
import { useScanOutActivePane } from '@/components/outbound/scan-out/useScanOutStation';
import { useAuth } from '@/contexts/AuthContext';

const SCAN_OUT_RAIL_LIMIT = 50;

function shippedFacts(row: ShippedHistoryRow): RailPeekFact[] {
  return [
    { tone: 'order', value: row.order_id ?? '', platformValue: row.account_source ?? null },
    { tone: 'tracking', value: row.shipping_tracking_number ?? '' },
    { tone: 'sku', value: row.sku ?? '' },
  ];
}

function rowToPane(row: ShippedHistoryRow): ScanOutActivePane {
  const qty = Math.max(1, parseInt(String(row.quantity || '1'), 10) || 1);
  return {
    orderRowId: Number(row.id) || null,
    orderId: String(row.order_id || ''),
    productTitle: String(row.product_title || '') || 'Shipment',
    qty,
    condition: String(row.condition || ''),
    tracking: String(row.shipping_tracking_number || ''),
    sku: String(row.sku || ''),
    itemNumber: row.item_number ?? null,
    shipmentId: null,
    accountSource: row.account_source ?? null,
    scanDriven: false,
    status: 'ok',
    message: null,
  };
}

function paneToOptimisticRow(pane: ScanOutActivePane): ShippedHistoryRow {
  return {
    id: pane.orderRowId && pane.orderRowId > 0 ? pane.orderRowId : -Date.now(),
    ship_by_date: null,
    created_at: new Date().toISOString(),
    order_id: pane.orderId,
    product_title: pane.productTitle,
    item_number: pane.itemNumber,
    account_source: pane.accountSource,
    sku: pane.sku,
    condition: pane.condition || null,
    quantity: String(pane.qty),
    status: 'SHIPPED',
    shipping_tracking_number: pane.tracking,
    is_out_of_stock: false,
    tester_id: null,
    tester_name: null,
    has_tech_scan: false,
    is_shipped: true,
    ship_confirmed_at: new Date().toISOString(),
  };
}

async function fetchScanOutRecent(): Promise<ShippedHistoryRow[]> {
  const res = await fetch('/api/orders/recent?staff=1', { cache: 'no-store' });
  if (!res.ok) throw new Error(`recent failed (${res.status})`);
  const data = (await res.json()) as { orders?: RecentOrderRow[] };
  return (data.orders ?? []).map(recentOrderToShippedRow).slice(0, SCAN_OUT_RAIL_LIMIT);
}

export function ScanOutRecentRail({ filterText = '' }: { filterText?: string }) {
  const { user } = useAuth();
  const staffId = Number(user?.staffId) || 0;
  const queryClient = useQueryClient();
  const activePane = useScanOutActivePane();
  const trimmed = filterText.trim().toLowerCase();

  const queryKey = useMemo(
    () => ['outbound', 'scan-out-recent', staffId] as const,
    [staffId],
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchScanOutRecent,
    enabled: staffId > 0,
    staleTime: 15_000,
  });

  // Optimistic prepend on confirm — then invalidate settles the real row ids.
  useEffect(() => {
    const handler = (e: Event) => {
      const pane = (e as CustomEvent<ScanOutActivePane>).detail;
      if (!pane?.tracking) return;
      queryClient.setQueryData<ShippedHistoryRow[]>(queryKey, (prev = []) => {
        const next = paneToOptimisticRow(pane);
        const tracking = next.shipping_tracking_number.trim().toUpperCase();
        const without = prev.filter(
          (r) => String(r.shipping_tracking_number || '').trim().toUpperCase() !== tracking,
        );
        return [next, ...without].slice(0, SCAN_OUT_RAIL_LIMIT);
      });
    };
    window.addEventListener(SCAN_OUT_CONFIRMED_EVENT, handler);
    return () => window.removeEventListener(SCAN_OUT_CONFIRMED_EVENT, handler);
  }, [queryClient, queryKey]);

  const filtered = useMemo(() => {
    if (!trimmed) return rows;
    return rows.filter((r) => {
      const hay = [
        r.product_title,
        r.order_id,
        r.sku,
        r.shipping_tracking_number,
        r.item_number,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return hay.includes(trimmed);
    });
  }, [rows, trimmed]);

  const version = useMemo(
    () => filtered.map((r) => `${r.id}:${r.ship_confirmed_at ?? ''}`).join('|'),
    [filtered],
  );
  const railKey = useMemo(
    () => ['outbound', 'scan-out-recent', 'rail', staffId, trimmed, version] as const,
    [staffId, trimmed, version],
  );
  const fetchFn = useCallback(async () => filtered, [filtered]);

  const selectedId = useMemo(() => {
    if (!activePane) return null;
    const tracking = activePane.tracking.trim().toUpperCase();
    const orderId = activePane.orderId.trim();
    const hit = filtered.find((r) => {
      if (activePane.orderRowId && Number(r.id) === activePane.orderRowId) return true;
      if (tracking && String(r.shipping_tracking_number || '').trim().toUpperCase() === tracking) {
        return true;
      }
      if (orderId && String(r.order_id || '').trim() === orderId) return true;
      return false;
    });
    return hit ? Number(hit.id) : null;
  }, [activePane, filtered]);

  const handleSelect = useCallback(
    (row: ShippedHistoryRow) => {
      const isOpen = selectedId != null && Number(row.id) === selectedId;
      dispatchScanOutActive(isOpen ? null : rowToPane(row));
    },
    [selectedId],
  );

  if (staffId <= 0) {
    return (
      <section className="min-w-0 border-t border-border-hairline bg-surface-card px-3 py-3">
        <p className="text-role-micro font-semibold text-text-faint">Sign in to see your ship-outs</p>
      </section>
    );
  }

  return (
    <SidebarRailScrollport>
      <SidebarRecentRailBase<ShippedHistoryRow>
        queryKey={railKey}
        fetchFn={fetchFn}
        selectedId={selectedId}
        limit={SCAN_OUT_RAIL_LIMIT}
        preserveServerOrder
        eyebrowTitle="Shipped out"
        emptyText={isLoading ? 'Loading ship-outs…' : 'Scan a label to ship out'}
        getId={(row) => Number(row.id)}
        getActivityAt={(row) => row.ship_confirmed_at ?? row.created_at}
        onSelect={handleSelect}
        getStatusDot={() => getShippedOutStatusDot()}
        getStatusDotLabel={() => getShippedOutStatusDotLabel()}
        getCollapsePinLabel={(row) => shippedOutRailTitle(row)}
        getCollapsePinMeta={(row) => row.shipping_tracking_number || row.order_id || null}
        getCollapsePinFacts={shippedFacts}
        navRegionId="left"
        renderRowMain={(row) => (
          <div data-scan-out-row-id={row.id} className="min-w-0 flex-1">
            <RailRowBody className="flex-1" vm={shippedOutToDenseRailVM(row)} />
          </div>
        )}
        renderPopover={(row, { openWorkspace, dismiss }) => (
          <RailPeekCard
            title={shippedOutRailTitle(row)}
            statusLabel={getShippedOutStatusDotLabel()}
            statusDotClass={getShippedOutStatusDot()}
            facts={shippedFacts(row)}
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
