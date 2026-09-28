'use client';

import { useMutation } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Boxes, Loader2, PackageCheck, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS, RECORD_TRAILING_ACTION_CLASS } from '@/design-system/tokens/industrial-record';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

type AllocateResponse =
  | { ok: true; requested: number; allocated: number; partial: boolean }
  | { ok: false; error: string; requested?: number; allocated?: number };

async function postAllocate(orderId: number, quantity: number): Promise<AllocateResponse> {
  const res = await fetch(`/api/orders/${orderId}/allocate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quantity, client_event_id: `record-allocate-${orderId}-${Date.now()}` }),
  });
  const json = (await res.json().catch(() => null)) as AllocateResponse | null;
  if (!json) return { ok: false, error: `Allocate failed (${res.status})` };
  return json;
}

/**
 * The line's stock facts on the item facts row, icon-first: `▦ n on hand` (the
 * SKU's `sku_stock` count; warn when it cannot cover the quantity) and
 * `✓ Allocated a/qty` (live unit allocations). When units are still missing
 * and stock exists, one + icon allocates the gap through
 * `POST /api/orders/[id]/allocate`. Null when the line has no SKU.
 */
export function OrderLineStock({ line }: { line: ShippedOrder }) {
  const orderId = Number(line.id);
  const allocate = useMutation({
    mutationFn: (quantity: number) => postAllocate(orderId, quantity),
    onSuccess: (result) => {
      if (!result.ok) {
        // A failure that carries `requested` is the 409 "no pickable unit for this SKU".
        toast.error(result.requested != null ? 'No stocked units to allocate' : result.error);
        return;
      }
      if (result.allocated === 0) toast.warning('No stocked units to allocate');
      else if (result.partial) toast.warning(`Allocated ${result.allocated} of ${result.requested}`);
      else toast.success(result.allocated === 1 ? 'Allocated 1 unit' : `Allocated ${result.allocated} units`);
      refreshDomain('orders.outbound');
    },
    onError: () => toast.error('Could not allocate units'),
  });

  const sku = String(line.sku ?? '').trim();
  if (!sku) return null;

  const qtyRaw = Number(line.quantity);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const onHandRaw = Number(line.sku_stock_on_hand);
  const onHand = line.sku_stock_on_hand != null && Number.isFinite(onHandRaw) ? onHandRaw : 0;
  const allocatedRaw = Number(line.allocated_unit_count);
  const allocated = Number.isFinite(allocatedRaw) && allocatedRaw > 0 ? allocatedRaw : 0;
  const missing = Math.max(0, qty - allocated);
  const canAllocate = missing > 0 && onHand > 0 && !line.is_shipped;
  const short = onHand < qty;

  return (
    <span className="inline-flex min-w-0 items-center gap-3" data-testid="order-record-line-stock">
      <HoverTooltip label={`${sku} on hand`} asChild placement="above">
        <span
          className={cn(RECORD_LABEL_CLASS, 'inline-flex h-8 items-center gap-1.5 tabular-nums', short ? 'text-mode-warn' : 'text-mode-muted')}
          data-testid="order-record-on-hand"
          data-short={short ? 'yes' : 'no'}
        >
          <Boxes aria-hidden className="size-3.5 shrink-0" />
          <span className={short ? 'text-mode-warn' : 'text-mode-ink'}>{onHand}</span> on hand
        </span>
      </HoverTooltip>
      <span
        className={cn(RECORD_LABEL_CLASS, 'inline-flex h-8 items-center gap-1.5 tabular-nums text-mode-muted')}
        data-testid="order-record-allocated"
      >
        <PackageCheck aria-hidden className="size-3.5 shrink-0" />
        Allocated{' '}
        <span className={allocated >= qty ? 'text-mode-ink' : 'text-mode-warn'}>
          {allocated}/{qty}
        </span>
        {canAllocate ? (
          <HoverTooltip label={missing === 1 ? 'Allocate 1 unit' : `Allocate ${missing} units`} asChild placement="above">
            <button
              type="button"
              aria-label="Allocate units"
              disabled={allocate.isPending}
              onClick={() => allocate.mutate(missing)}
              data-testid="order-record-allocate"
              className={cn('ds-raw-button', RECORD_TRAILING_ACTION_CLASS, focusRing('control'))}
            >
              {allocate.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          </HoverTooltip>
        ) : null}
      </span>
    </span>
  );
}
