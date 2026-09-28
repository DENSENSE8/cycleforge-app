'use client';

/** Paperwork walk rail — the Labels queue, the run's orders in the triage face (the walk is a triage region). */

import { useEffect, useMemo, useRef } from 'react';
import type { ShippedOrder } from '@/types/orders';
import type { OrderChannelResolver } from '@/lib/platform-display';
import { useOrderChannel } from '@/hooks/useCatalog';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { NAV_KEY_HINT_CLASS, useNavRegion } from '@/lib/keyboard/nav-keys';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_OPEN_CLASS, RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { recordState } from '../outbound-orders-ledger-state';

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
      <div className="flex min-h-mode-hit shrink-0 items-center gap-2 border-b border-mode-divide px-4">
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
          className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain p-2"
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
  const title = row.product_title || orderId || String(row.id);
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
        'ds-raw-button relative flex w-full flex-col gap-0.5 rounded-mode-control px-3 py-2 text-left text-mode-ink hover:bg-mode-hover',
        open && RECORD_OPEN_CLASS,
        focusRing('control'),
      )}
    >
      <span className="flex min-w-0 items-center gap-2" aria-hidden>
        <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{orderId || String(row.id)}</span>
        <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
          <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
          <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>{channel.shortLabel || '—'}</span>
        </span>
      </span>
      <span className={RECORD_TITLE_CLASS} aria-hidden>
        {title}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-role-caption" aria-hidden>
        <span className={cn('size-2 shrink-0 rounded-mode-pill', LIFECYCLE_CLASSES[state].dot)} />
        <span className="min-w-0 flex-1 truncate text-mode-muted">{spec.label}</span>
        <span className={cn('shrink-0', tracked ? 'text-mode-muted' : 'font-medium text-mode-warn')}>
          {tracked ? 'Tracked' : 'No label'}
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
