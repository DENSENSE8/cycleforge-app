'use client';

/** KioskRecentCarts — the counter's open carts, one tap to switch. */

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import { Plus } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import type { KioskRecentCart } from '@/components/kiosk/useKioskCartSync';
import { formatCartCents } from '@/lib/kiosk/cart-card-view';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_META, KIOSK_UTILITY_SHEET } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';

/** "3m ago" — the list is read at a glance across a counter, not audited. */
function updatedAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function KioskRecentCarts({
  carts,
  currentCartId,
  onNewCart,
  onOpenCart,
}: {
  carts: readonly KioskRecentCart[];
  /** The cart on this tablet right now, if it has an id yet. */
  currentCartId: number | null;
  onNewCart: () => Promise<void> | void;
  onOpenCart: (id: number) => Promise<void> | void;
}) {
  // One tap in flight at a time: a double tap must not open two carts in a row.
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const now = Date.now();

  const run = async (key: number | 'new', action: () => Promise<void> | void) => {
    if (busy !== null) return;
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className={KIOSK_UTILITY_SHEET} data-testid="kiosk-recent-carts">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <Button
          variant="secondary"
          size="lg"
          className="w-full justify-center"
          disabled={busy !== null}
          data-testid="kiosk-recent-carts-new"
          onClick={() => void run('new', onNewCart)}
        >
          <Plus className="h-4 w-4" />
          New cart
        </Button>

        {carts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-text-soft">
            No open carts.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Open carts">
            {carts.map((cart) => {
              const current = cart.id === currentCartId;
              return (
                <li key={cart.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    disabled={busy !== null}
                    data-testid="kiosk-recent-cart"
                    data-cart-id={cart.id}
                    onClick={() => void run(cart.id, () => onOpenCart(cart.id))}
                    className={cn(
                      'flex w-full flex-col gap-2 border border-border-hairline bg-surface-card px-4 py-3 text-left',
                      MOBILE_SCAN_ROW_CORNER,
                      'cursor-pointer transition-colors hover:bg-surface-hover disabled:cursor-default',
                      current && 'bg-surface-accent',
                    )}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 text-sm font-bold tabular-nums text-text-default">
                        #{cart.id}
                      </span>
                      <span className="min-w-0 truncate text-sm font-semibold text-text-default">
                        {cart.label ?? 'Walk-in'}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <KioskChip tone={cart.heldHere ? 'success' : 'info'}>
                          {cart.heldHere ? 'On this tablet' : 'On another device'}
                        </KioskChip>
                        <span className={KIOSK_META}>
                          {busy === cart.id ? 'Opening…' : `Updated ${updatedAgo(cart.updatedAt, now)}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-base font-semibold tabular-nums">
                        <span className="text-text-default">{cart.itemCount} ·</span>{' '}
                        <span className="text-text-success">{formatCartCents(cart.totalCents)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
