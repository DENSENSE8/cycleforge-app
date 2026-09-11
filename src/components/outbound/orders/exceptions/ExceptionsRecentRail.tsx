'use client';

/**
 * Order-exceptions rail — the left column of the workbench.
 *
 * A PRESET over {@link SidebarRecentRailBase}, not a rail of its own. The
 * surface previously shipped `ExceptionQueueList`: a hand-rolled `<ul>` with its
 * own ↑/↓/j/k handler, its own skeletons, its own selection wash and its own
 * focus ring — a second implementation of the rail every other station already
 * has, free to drift from all of them on every axis at once. The shell brings
 * the row frame, the status-dot track, the hover peek, the row ⋮ menu, the
 * parked-strip pins and the keyboard for nothing.
 *
 * ## The row is the unbox row
 *
 * Not "a title in a RailRowBody" — the SAME anatomy `ReceivingRowMain` builds
 * for the unbox / testing recent rail: status dot in the frame's own leftmost
 * track, title on the anchor line, pair-once fan-out (else quantity) on the
 * meta line under it, in that line's uppercase tracked-out `text-text-soft`.
 * Handing `RailRowBody` a title
 * and nothing else technically used the primitive while producing a row that
 * looked like no other rail in the app — the exact failure the primitive
 * exists to prevent.
 *
 * Everything else is on the hover peek ({@link RailPeekCard}), one row at a
 * time, for the row actually being considered. "Caged" is gone entirely, not
 * moved: every row on this surface is caged, so the badge distinguished
 * nothing. The status DOT carries the one bit worth having at a glance.
 */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import type { RailPeekFact } from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  exceptionRailMetaCount,
  sortExceptionQueueRows,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';

const EXCEPTIONS_RAIL_LIMIT = 60;

/**
 * One bit, at a glance: is this order still blocked, and is the blocker the one
 * the operator is here to clear (pairing) or a downstream fulfillment fact.
 */
export function getExceptionStatusDot(row: OrderExceptionRow): string {
  if (row.blockers.length === 0) return 'bg-emerald-500';
  if (row.blockers.includes('unpaired')) return 'bg-amber-400';
  return 'bg-blue-500';
}

export function getExceptionStatusDotLabel(row: OrderExceptionRow): string {
  if (row.blockers.length === 0) return 'Paired';
  return row.blockers.map((b) => ORDER_EXCEPTION_BLOCKER_LABEL[b]).join(' · ');
}

/**
 * The row's copyable identities — one list feeding the peek and the ⋮ menu.
 *
 * Item number is deliberately NOT a chip of its own. It is a different key from
 * the SKU (a marketplace listing id vs the internal catalog key), but a
 * single-identifier channel writes one value into both — and on this org's
 * caged set that is every row, 22 of 22. Chipping both painted the same string
 * twice under two labels, which reads as a bug in the display rather than as
 * agreement in the data. When they genuinely DIFFER that IS worth saying, and
 * {@link exceptionKeyMismatch} says it on the meta line instead.
 */
const exceptionFacts = (row: OrderExceptionRow): RailPeekFact[] => [
  { tone: 'order', value: row.orderNumber ?? '' },
  { tone: 'sku', value: row.sku ?? row.catalogSku ?? '' },
  { tone: 'tracking', value: row.trackingNumber ?? '' },
];

/** The item number, but only when it is not simply the SKU again. */
export function exceptionKeyMismatch(row: OrderExceptionRow): string | null {
  const item = (row.itemNumber ?? '').trim();
  const sku = (row.sku ?? '').trim();
  if (!item || item === sku) return null;
  return item;
}

function exceptionTitle(row: OrderExceptionRow): string {
  return row.productTitle || row.catalogTitle || row.orderNumber || `#${row.id}`;
}

export function ExceptionsRecentRail({
  rows,
  selectedId,
  onSelect,
  loading,
}: {
  rows: OrderExceptionRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  /**
   * The workbench owns the fetch (it also drives the detail pane and
   * resolve-and-advance), so the rail is handed settled rows and its `fetchFn`
   * just returns them. The key carries the row identity so the shell re-reads
   * when the workbench's query settles — the same handoff
   * `ProductLabelsRecentRail` uses to filter client-side.
   */
  const ordered = useMemo(() => sortExceptionQueueRows(rows), [rows]);
  const version = useMemo(() => ordered.map((r) => r.id).join('|'), [ordered]);
  const queryKey = useMemo(() => ['order-exceptions.rail', version] as const, [version]);
  const fetchFn = useCallback(async () => ordered, [ordered]);

  const select = useCallback((row: OrderExceptionRow) => onSelect(row.id), [onSelect]);

  return (
    <SidebarRailScrollport>
      <SidebarRecentRailBase<OrderExceptionRow>
        queryKey={queryKey}
        fetchFn={fetchFn}
        selectedId={selectedId}
        limit={EXCEPTIONS_RAIL_LIMIT}
        // SQL + {@link sortExceptionQueueRows} share one axis: missing item
        // number, then pair-once fan-out. Do not hoist the selected row — that
        // would unpin the urgent cluster.
        preserveServerOrder
        pinSelectedLead={false}
        eyebrowTitle="Order exceptions"
        emptyText={loading ? 'Loading exceptions…' : 'No orders are blocked in this scope'}
        getId={(row) => row.id}
        onSelect={select}
        getStatusDot={getExceptionStatusDot}
        getStatusDotLabel={getExceptionStatusDotLabel}
        getCollapsePinLabel={exceptionTitle}
        getCollapsePinMeta={(row) =>
          row.orderNumber ? `${row.orderNumber}${row.sku ? ` · ${row.sku}` : ''}` : row.sku
        }
        getCollapsePinFacts={exceptionFacts}
        // `navRegionId` is what paints the ⌘; keycaps. The shell's own
        // `handleKeyDown` owns ↑/↓ on the listbox, so the hand-rolled j/k
        // listener is gone with the hand-rolled list.
        navRegionId="left"
        renderRowMain={(row, ctx) => (
          // `data-order-row-id` is the workbench's own selection hook (and what
          // the e2e counts). It rides the content, not the frame, because the
          // frame belongs to RailRow.
          <div data-order-row-id={row.id} className="min-w-0 flex-1">
            <RailRowBody
              vm={{
                title: exceptionTitle(row),
                titleAttr: exceptionTitle(row),
                titleAccessory: ctx.pkgChip,
                // Same Unbox meta SHAPE (uppercase tracked-out soft ink). The
                // number is the banner's sibling fan-out when pairing clears
                // other orders; otherwise this row's quantity.
                meta: (
                  <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
                    <span className="truncate text-text-muted">{exceptionRailMetaCount(row)}</span>
                  </span>
                ),
              }}
            />
          </div>
        )}
        renderPopover={(row, { openWorkspace, dismiss }) => (
          <RailPeekCard
            title={exceptionTitle(row)}
            statusLabel={getExceptionStatusDotLabel(row)}
            statusDotClass={getExceptionStatusDot(row)}
            meta={
              [
                exceptionKeyMismatch(row) && `item # ${exceptionKeyMismatch(row)}`,
                row.siblingUnpairedCount > 0 &&
                  `pairing also clears ${row.siblingUnpairedCount} other order${
                    row.siblingUnpairedCount === 1 ? '' : 's'
                  }`,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            facts={exceptionFacts(row)}
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
