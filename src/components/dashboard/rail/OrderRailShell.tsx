'use client';

/**
 * The rail body for a MULTI-row selection — occupant `detail:order-batch`.
 *
 * Cardinality decides the rail body (`selection-occupancy.ts`): one row is the
 * existing `detail:order` inspector, which `GlobalDetailStackHost` already
 * mounts and which this component deliberately does not touch; exactly two is
 * `OrderRailCompare`; three or more is this shell.
 *
 * Roster rows compose {@link RailSelectionRosterRow} / {@link StackedRowIdentity}
 * (wrapping title → platform-aware {@link OrderIdChip}) — never a single-line
 * title | mono id twin. Hash glyph tone + hover label come from
 * `usePlatformMeta` / `platformMetaIconTone` (SoT).
 */

import { useCallback, useMemo } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  RailSelectionRoster,
  RailSelectionRosterRow,
} from '@/components/right-rail/RailSelectionRoster';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone } from '@/lib/source-platform';
import { emitToggleAll } from '@/lib/selection/table-selection';
import {
  isRailOccupantActive,
  resolveRailOccupancy,
} from '@/lib/right-rail/selection-occupancy';
import {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
} from './OrderRailActions';
import { OrdersViewTopicsCluster } from '@/components/outbound/orders/OrdersViewTopicsCluster';
import {
  OrdersViewChromeBridge,
  useOrdersViewChromeOptional,
} from '@/components/outbound/orders/orders-view-chrome-context';

/** The few fields the roster reads. Satisfied by both outbound row shapes. */
type RosterRow = {
  id: number | string;
  order_id?: string | null;
  item_name?: string | null;
  product_title?: string | null;
  sku?: string | null;
  /** Raw platform key for OrderIdChip hover + `#` glyph tone. */
  account_source?: string | null;
  source_platform?: string | null;
};

function rosterTitle(row: RosterRow): string {
  const title = String(row.item_name || row.product_title || '').trim();
  if (title) return title;
  const sku = String(row.sku || '').trim();
  if (sku) return sku;
  // Honest absence — never a blank row, never an invented "Untitled order".
  return '—';
}

function platformRawOf(row: RosterRow): string {
  return String(row.account_source || row.source_platform || '').trim();
}

/** Platform-aware order key — tooltip `eBay 08-…`, `#` glyph from catalog tone. */
function OrderRosterKey({
  orderId,
  platformRaw,
}: {
  orderId: string;
  platformRaw: string;
}) {
  const resolvePlatformMeta = usePlatformMeta();
  const platformMeta = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformLabel = platformMeta?.label ?? null;
  const iconTone = platformMeta ? platformMetaIconTone(platformMeta) : null;

  return (
    <OrderIdChip
      value={orderId}
      display={getLast8(orderId)}
      dense
      fitDisplayWidth
      displayWidth="last8"
      platformLabel={platformLabel}
      iconClass={iconTone?.className}
      iconStyle={iconTone?.style}
    />
  );
}

export function OrderRailShell() {
  const { scope, rows } = useRailActionSnapshot();
  const viewChrome = useOrdersViewChromeOptional();
  const occupancy = useMemo(
    () => resolveRailOccupancy((rows as RosterRow[]).map((r) => Number(r.id))),
    [rows],
  );

  // D4: closing the rail CLEARS the selection. With the capsule gone this is
  // the only dismissal affordance, and a rail that merely hid itself would
  // leave rows checked with nothing on screen saying so.
  const handleClose = useCallback(() => {
    if (scope) emitToggleAll(scope, 'none');
  }, [scope]);

  // 3+ only — exactly two is `OrderRailCompare`. Gated through the resolver's
  // own helper so the two registrars can never both claim the slot.
  const active = isRailOccupantActive(occupancy, 'attention');

  return (
    <DetailStackRailRegistrar
      // Stable per MODE, never per record — a per-record id would remount the
      // whole push column on every checkbox. See selection-occupancy.ts.
      id="detail:order-batch"
      enabled={active}
      onClose={handleClose}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel={`${rows.length} orders selected`}
    >
      <OrdersViewChromeBridge value={viewChrome}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <RailSelectionBand onClose={handleClose} />
        {active && viewChrome ? (
          <div
            className="flex h-9 min-w-0 items-center justify-end gap-2 border-b border-border-hairline px-2"
            role="toolbar"
            aria-label="Orders view topics"
          >
            <OrdersViewTopicsCluster />
          </div>
        ) : null}

        <RailSelectionRoster>
          {(rows as RosterRow[]).map((row) => {
            const orderId = String(row.order_id || '').trim();
            return (
              <RailSelectionRosterRow
                key={String(row.id)}
                title={rosterTitle(row)}
                keys={
                  orderId ? (
                    <OrderRosterKey orderId={orderId} platformRaw={platformRawOf(row)} />
                  ) : (
                    <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                      —
                    </span>
                  )
                }
              />
            );
          })}
        </RailSelectionRoster>

        <RailActionRegion />
      </div>
      </OrdersViewChromeBridge>
    </DetailStackRailRegistrar>
  );
}
