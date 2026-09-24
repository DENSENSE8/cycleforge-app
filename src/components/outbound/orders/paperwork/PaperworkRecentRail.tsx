'use client';

/**
 * Paperwork walk rail — the run's orders as industrial records.
 *
 * Same record face as the To-ship ledger (state spine + code, platform, order
 * # in the ID face, the title band) so walking one order never changes the
 * vocabulary the queue was read in. The whole run is listed — the walk list is
 * the To-ship subset in play (selection, or the loaded queue) — and the open
 * record keeps the ledger's 2px ink outline and scrolls into view as the walk
 * advances. Keyboard: the walk host owns the `record` cursor, so J / K / ↑ / ↓
 * step these records from anywhere in the walk; Tab + Enter open a row; the
 * leader-armed nav keys (region `left`) still reach every row.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { ShippedOrder } from '@/types/orders';
import type { OrderChannelResolver } from '@/lib/platform-display';
import { useOrderChannel } from '@/hooks/useCatalog';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { NAV_KEY_HINT_CLASS, useNavRegion } from '@/lib/keyboard/nav-keys';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_TITLE_CLASS,
  recordStateCodeClass,
} from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { recordState } from '../outbound-orders-ledger-state';
import {
  LEDGER_BAND_CLASS,
  LEDGER_SPINE_CLASS,
  LEDGER_SPINE_HATCH_CLASS,
} from '../outbound-orders-ledger-geometry';

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
  const channelOf = useOrderChannel();
  const listRef = useRef<HTMLOListElement>(null);

  const navTargets = useMemo(() => rows.map((r) => ({ id: String(r.id) })), [rows]);
  const { armed: navArmed, keymap: navKeymap } = useNavRegion({
    id: 'left',
    targets: navTargets,
    onCommit: (targetId) => onSelect(Number(targetId)),
  });

  // The walk advances from the editor too — keep the open record in view.
  useEffect(() => {
    if (selectedId == null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-paperwork-row-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="box-content flex min-h-mode-hit shrink-0 items-center gap-2 border-b-2 border-mode-ink px-4">
        <span className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>Labels queue</span>
        <span className={cn(RECORD_LABEL_CLASS, 'tabular-nums text-mode-ink')}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className={cn(RECORD_LABEL_CLASS, 'px-4 py-3 text-mode-muted')}>
          {loading ? 'Loading orders…' : 'No orders in this walk'}
        </p>
      ) : (
        <ol
          ref={listRef}
          aria-label="Labels queue records"
          aria-busy={loading || undefined}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {rows.map((row) => (
            <li key={row.id}>
              <PaperworkRailRecord
                row={row}
                open={Number(row.id) === Number(selectedId)}
                channelOf={channelOf}
                navKey={navArmed ? navKeymap.get(String(row.id)) : undefined}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PaperworkRailRecord({
  row,
  open,
  channelOf,
  navKey,
  onSelect,
}: {
  row: ShippedOrder;
  open: boolean;
  channelOf: OrderChannelResolver;
  navKey: string | undefined;
  onSelect: (id: number) => void;
}) {
  const state = recordState(row);
  const spec = LIFECYCLE[state];
  const orderId = String(row.order_id ?? '').trim();
  const channel = channelOf(orderId, row.account_source);
  const title = row.product_title || orderId || `#${row.id}`;
  const tracked = String(row.shipping_tracking_number || '').trim() !== '';

  return (
    <button
      type="button"
      data-paperwork-row-id={row.id}
      data-state={state}
      aria-current={open || undefined}
      aria-label={`Order ${orderId || row.id}, ${spec.label}, ${tracked ? 'tracking linked' : 'needs a label'}, ${title}`}
      onClick={() => onSelect(row.id)}
      className={cn(
        'ds-raw-button relative flex w-full border-b border-mode-ink bg-mode-panel text-left text-mode-ink hover:bg-mode-hover',
        state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
        open && 'outline outline-2 -outline-offset-2 outline-mode-ink',
        focusRing('cell'),
      )}
    >
      <span
        className={cn(
          LEDGER_SPINE_CLASS,
          LIFECYCLE_CLASSES[state].dot,
          state === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col" aria-hidden>
        {/* Band 1 — state · platform · order # ··· label state */}
        <span className={cn('flex min-w-0 items-center gap-2 border-b border-mode-rule pl-2 pr-3', LEDGER_BAND_CLASS.M)}>
          <span className={cn(RECORD_LABEL_CLASS, 'w-9 shrink-0', recordStateCodeClass(state))}>{spec.code}</span>
          <span className="inline-flex w-14 shrink-0 items-center gap-1.5">
            <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
            <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>{channel.shortLabel || '—'}</span>
          </span>
          <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{orderId || `#${row.id}`}</span>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', tracked ? 'text-mode-muted' : 'text-mode-warn')}>
            {tracked ? 'Tracked' : 'No label'}
          </span>
        </span>
        {/* Band 2 — what it is */}
        <span className={cn('flex min-w-0 items-center pl-2 pr-3', LEDGER_BAND_CLASS.M)}>
          <span className={RECORD_TITLE_CLASS}>{title}</span>
        </span>
      </span>
      {navKey ? (
        <span
          aria-hidden
          className={cn(NAV_KEY_HINT_CLASS, 'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2')}
        >
          {navKey}
        </span>
      ) : null}
    </button>
  );
}
