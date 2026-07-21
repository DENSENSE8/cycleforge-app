'use client';

/**
 * Review · Pairing detail — allocate a serial (or confirm SKU-only) to the
 * selected outbound order via POST /api/serial-units/[id]/allocate.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives/Button';
import { Loader2, Link2, X } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { ShippedOrder } from '@/types/orders';

async function allocateSerial(args: {
  serial: string;
  orderPk: number;
  transfer?: boolean;
}): Promise<{ ok: boolean; status: number; error?: string; orderRef?: string }> {
  const res = await fetch(
    `/api/serial-units/${encodeURIComponent(args.serial.trim())}/allocate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_pk: args.orderPk,
        transfer: args.transfer === true,
        client_event_id: safeRandomUUID(),
      }),
    },
  );
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok && Boolean(data?.success),
    status: res.status,
    error: data?.error ? String(data.error) : undefined,
    orderRef: data?.order_ref ? String(data.order_ref) : undefined,
  };
}

export function ReviewPairingDetail({
  order,
  onClose,
}: {
  order: ShippedOrder;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [serialInput, setSerialInput] = useState('');
  const [transferReady, setTransferReady] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['review-pairing-order', order.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' });
      if (!res.ok) return order;
      const data = await res.json().catch(() => null);
      return (data?.order as ShippedOrder | undefined) ?? order;
    },
    initialData: order,
    staleTime: 15_000,
  });

  const live = orderQuery.data ?? order;
  const sku = String(live.sku || '').trim();
  const existingSerials = String(live.serial_number || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allocate = useMutation({
    mutationFn: (transfer: boolean) =>
      allocateSerial({ serial: serialInput, orderPk: Number(live.id), transfer }),
    onSuccess: (res) => {
      if (res.status === 409 && !transferReady) {
        setTransferReady(true);
        toast.message('Already allocated — submit again to reassign.');
        return;
      }
      if (!res.ok) {
        toast.error(res.error || 'Could not allocate serial.');
        return;
      }
      toast.success(res.orderRef ? `Paired with ${res.orderRef}` : 'Serial allocated');
      setSerialInput('');
      setTransferReady(false);
      queryClient.invalidateQueries({ queryKey: ['review-pairing-order', order.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'packed'] });
      void orderQuery.refetch();
    },
    onError: () => toast.error('Could not allocate serial.'),
  });

  const busy = allocate.isPending;
  const canSubmit = serialInput.trim().length > 0 && !busy;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-canvas">
      <div className="shrink-0 border-b border-border-hairline bg-surface-card px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
              Review · Pairing
            </p>
            <p className="truncate text-role-title font-black text-text-default">
              {live.order_id || `Order #${live.id}`}
            </p>
            {live.product_title ? (
              <p className="mt-0.5 truncate text-role-caption text-text-muted">{live.product_title}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-1.5">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">Line</p>
          <p className="text-role-caption font-semibold text-text-default">
            {sku ? (
              <>
                SKU <span className="font-mono">{sku}</span>
              </>
            ) : (
              'No SKU on this line — allocate a serial when the unit is known.'
            )}
          </p>
          {existingSerials.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {existingSerials.map((s) => (
                <li
                  key={s}
                  className="rounded-lg border border-border-hairline bg-surface-sunken px-3 py-1.5 font-mono text-role-caption text-text-default"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-role-caption text-text-faint">No serials linked yet.</p>
          )}
        </section>

        <section className="space-y-1.5">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
            Scan or enter serial
          </p>
          <input
            value={serialInput}
            onChange={(e) => {
              setSerialInput(e.target.value);
              setTransferReady(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) {
                e.preventDefault();
                allocate.mutate(transferReady);
              }
            }}
            placeholder="Serial number"
            autoFocus
            className={cn(
              'w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 font-mono text-role-caption text-text-default placeholder:text-text-faint',
              focusRing('field', 'accent'),
            )}
          />
        </section>
      </div>

      <div className="shrink-0 border-t border-border-hairline bg-surface-card px-5 py-3">
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          disabled={!canSubmit}
          onClick={() => allocate.mutate(transferReady)}
        >
          {transferReady ? 'Reassign serial' : 'Allocate to order'}
        </Button>
      </div>
    </div>
  );
}
