'use client';

/** (4) of the inline New Support item form: the order / reference / link, resolved locally to the exact order(s) it names. */

import { useCallback, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import type { SupportOrderRef } from '@/lib/support/conversation/model';

type ReferenceState =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'orders'; candidates: SupportOrderRef[]; ambiguous: boolean }
  | { status: 'none' }
  | { status: 'error'; message: string };

/**
 * (4) The order / reference / link, resolved locally to the exact order(s) it names.
 * One unambiguous order is shown picked for the staffer to confirm; ambiguous waits for their pick.
 */
export interface OrderReference {
  reference: string;
  resolved: ReferenceState;
  pickedOrderId: number | null;
  /** The confirmed order — the item links it as primary. */
  pickedOrder: SupportOrderRef | null;
  /** Typed but not yet resolved, resolving, or ambiguous with no pick — the item waits. */
  pending: boolean;
  edit: (next: string) => void;
  pick: (orderId: number) => void;
  resolve: () => Promise<void>;
}

export function useOrderReference(): OrderReference {
  const [reference, setReference] = useState('');
  const [resolved, setResolved] = useState<ReferenceState>({ status: 'idle' });
  const [pickedOrderId, setPickedOrderId] = useState<number | null>(null);

  const resolve = useCallback(async () => {
    const value = reference.trim();
    setPickedOrderId(null);
    if (!value) {
      setResolved({ status: 'idle' });
      return;
    }
    setResolved({ status: 'resolving' });
    try {
      const res = await fetch(`/api/support/order-candidates?${new URLSearchParams({ q: value })}`, { credentials: 'same-origin' });
      const data = (await res.json().catch(() => null)) as { candidates?: SupportOrderRef[]; ambiguous?: boolean } | null;
      if (!res.ok || !data) {
        setResolved({ status: 'error', message: 'Could not look that up.' });
        return;
      }
      const candidates = data.candidates ?? [];
      if (candidates.length === 0) {
        setResolved({ status: 'none' });
        return;
      }
      const ambiguous = data.ambiguous === true || candidates.length > 1;
      setResolved({ status: 'orders', candidates, ambiguous });
      if (!ambiguous) setPickedOrderId(candidates[0]!.orderId);
    } catch {
      setResolved({ status: 'error', message: 'Could not look that up.' });
    }
  }, [reference]);

  const pickedOrder = resolved.status === 'orders' ? (resolved.candidates.find((c) => c.orderId === pickedOrderId) ?? null) : null;
  return {
    reference,
    resolved,
    pickedOrderId,
    pickedOrder,
    /** Typed but not yet resolved, resolving, or ambiguous with no pick — the item waits. */
    pending:
      resolved.status === 'resolving' ||
      (resolved.status === 'orders' && pickedOrder == null) ||
      (reference.trim() !== '' && resolved.status === 'idle'),
    edit: (next: string) => {
      setReference(next);
      setResolved({ status: 'idle' });
      setPickedOrderId(null);
    },
    pick: setPickedOrderId,
    resolve,
  };
}

/** (4) The reference field and its answer. */
export function OrderReferenceField({ state }: { state: OrderReference }) {
  return (
    <>
      <TextField
        label="Order #, item #, tracking or link (optional)"
        value={state.reference}
        onChange={state.edit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            void state.resolve();
          }
        }}
        onBlur={() => {
          if (state.reference.trim() && state.resolved.status === 'idle') void state.resolve();
        }}
        data-testid="support-item-reference"
      />
      <ReferenceResult state={state.resolved} pickedOrderId={state.pickedOrderId} onPick={state.pick} />
    </>
  );
}

/** (4)'s answer: the order(s) the reference names — picked explicitly when ambiguous. */
function ReferenceResult({
  state,
  pickedOrderId,
  onPick,
}: {
  state: ReferenceState;
  pickedOrderId: number | null;
  onPick: (orderId: number) => void;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'resolving') return <p className="px-1 text-xs text-text-muted">Finding…</p>;
  if (state.status === 'error') return <p className="px-1 text-xs text-text-danger">{state.message}</p>;
  if (state.status === 'none') return <p className="px-1 text-xs text-text-muted">No local order matches — the item is created without one.</p>;
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which order">
      {state.ambiguous ? <p className="px-1 text-xs font-semibold text-text-warning">More than one order matches — pick the right one.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {state.candidates.map((order) => {
          const picked = order.orderId === pickedOrderId;
          return (
            <Button
              key={order.orderId}
              size="sm"
              radius="pill"
              variant={picked ? 'primarySoft' : 'secondary'}
              role="radio"
              aria-checked={picked}
              onClick={() => onPick(order.orderId)}
              className="h-7 max-w-full gap-1.5 px-3 text-xs"
            >
              <span className="truncate font-semibold">Order {order.orderNumber ?? `#${order.orderId}`}</span>
              <span className="truncate text-text-muted">
                {[
                  order.platform,
                  // An account named like its platform (MEKONG · MEKONG) says it once.
                  order.accountLabel && order.accountLabel.trim().toLowerCase() !== order.platform?.trim().toLowerCase() ? order.accountLabel : null,
                  order.customerName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

