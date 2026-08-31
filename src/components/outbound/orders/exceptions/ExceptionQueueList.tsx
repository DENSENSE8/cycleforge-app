'use client';

/**
 * The exception queue — left rail of the order-exceptions workbench.
 *
 * One row per ORDER, because that is the unit the operator thinks in
 * ("I only care about my order"). Each row states the order, the item it is
 * supposed to be, and the reasons it is stuck — so choosing what to work on
 * next never requires opening anything.
 *
 * Keyboard: ↑/↓ (and j/k) move the selection, Enter focuses the editor. A
 * triage queue that needs the mouse for every row is a queue nobody finishes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  type OrderExceptionBlocker,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Pairing is the operator's job here; the rest are fulfillment facts. */
const BLOCKER_TONE: Record<OrderExceptionBlocker, 'warning' | 'secondary'> = {
  unpaired: 'warning',
  no_item_number: 'warning',
  no_tracking: 'secondary',
  no_docs: 'secondary',
  no_label: 'secondary',
};

export function ExceptionQueueList({
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
  const listRef = useRef<HTMLUListElement | null>(null);

  const move = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const index = rows.findIndex((r) => r.id === selectedId);
      const next = index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta));
      onSelect(rows[next]!.id);
    },
    [rows, selectedId, onSelect],
  );

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      // Never hijack keys while the operator is typing in the editor.
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        move(-1);
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [move]);

  if (loading && rows.length === 0) {
    // Row-shaped skeletons, not a spinner: the queue's height is knowable
    // before the data lands, so the list does not jump when it arrives.
    return (
      <div className="divide-y divide-border-hairline" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1.5 px-3 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-role-body font-semibold text-emerald-700">Queue clear</p>
        <p className="pt-1 text-role-caption text-text-soft">
          No orders are blocked in this scope.
        </p>
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- roving list owns ↑/↓/j/k
      tabIndex={0}
      aria-label="Order exceptions"
      className={cn('min-h-0 flex-1 divide-y divide-border-hairline overflow-y-auto', focusRing('control'))}
    >
      {rows.map((row) => {
        const active = row.id === row.id && selectedId === row.id;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row.id)}
              data-testid={`exception-row-${row.id}`}
              data-order-row-id={row.id}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'ds-raw-button block w-full px-3 py-2.5 text-left transition-colors',
                active ? 'bg-surface-sunken' : 'hover:bg-surface-hover',
                focusRing('control'),
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-role-caption font-semibold text-text-default">
                  {row.orderNumber ?? `#${row.id}`}
                </span>
                {row.releaseState === 'caged' ? (
                  <Badge variant="outline" className="shrink-0">
                    Caged
                  </Badge>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-role-caption text-text-muted">
                {row.productTitle || '(no title)'}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {row.blockers.map((b) => (
                  <Badge key={b} variant={BLOCKER_TONE[b]}>
                    {ORDER_EXCEPTION_BLOCKER_LABEL[b]}
                  </Badge>
                ))}
                {row.blockers.length === 0 ? (
                  <Badge variant="success">Ready to release</Badge>
                ) : null}
              </span>
              {row.siblingUnpairedCount > 0 ? (
                <span className="mt-1 block text-role-micro text-text-faint">
                  pairing also clears {row.siblingUnpairedCount} other order
                  {row.siblingUnpairedCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
