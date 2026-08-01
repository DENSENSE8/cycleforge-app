'use client';

/**
 * Record-plane triage block for the order inspector: the row's shared **flag**
 * and its append-only **note trail**.
 *
 * Both live here rather than in the grid because both are the record plane's
 * job (`display/workbench.md` → Action planes): the flag's *reason* and the
 * notes' *authors* need more room than a cell, and the grid already carries
 * their summary (the row tint, the corner indicator). The collection map shows
 * that something is true; this is where you find out what and who.
 *
 * The notes half is `OrderNotesTrail` — the single writable home for an order
 * annotation. It is append-only and attributed: the legacy scalar `orders.notes`
 * let the second person to touch a row overwrite the first, with no record of
 * who said either thing, and is now read-only history.
 */

import { Loader2 } from '@/components/Icons';
import { useMutation } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  ORDER_ROW_FLAGS,
  resolveOrderRowFlag,
  type OrderRowFlagId,
} from '@/lib/orders/order-row-flags';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { OrderNotesTrail } from './OrderNotesTrail';

export function OrderTriageSection({
  orderId,
  flag,
  flagSetBy,
  legacyNote,
}: {
  orderId: number;
  /** Current flag id from the row projection (`row_flag.flag`). */
  flag?: string | null;
  /** Who set it — attribution for a signal the whole org reads. */
  flagSetBy?: string | null;
  /** Read-only legacy scalar `orders.notes`, when the row still carries one. */
  legacyNote?: string | null;
}) {
  const current = resolveOrderRowFlag(flag);

  const setFlag = useMutation({
    mutationFn: async (next: OrderRowFlagId | null) => {
      const res = await fetch(`/api/orders/${orderId}/flag`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: next }),
      });
      if (!res.ok) throw new Error(`set flag ${res.status}`);
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === null ? 'Flag cleared' : 'Row flagged');
      // The tint lives on the queue row, which is a different query — refresh
      // the domain so the map and this panel cannot disagree about the flag.
      refreshDomain('orders.outbound');
    },
    onError: () => toast.error('Could not update the flag'),
  });

  return (
    <section className="mx-8 space-y-3">
      {/* ── Flag ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Flag</p>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={setFlag.isPending}
                aria-label={current ? `Flagged ${current.label} — change` : 'Set a flag'}
                className={cn(
                  'ds-raw-button inline-flex items-center gap-1.5 rounded ring-1 ring-inset inset-chip text-role-micro uppercase tracking-widest transition-colors',
                  focusRing('control', 'accent'),
                  current
                    ? current.chipClass
                    : 'bg-surface-card text-text-soft ring-border-default hover:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    current ? current.dotClass : 'border border-border-default',
                  )}
                  aria-hidden
                />
                {current ? current.label : 'No flag'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {ORDER_ROW_FLAGS.map((f) => (
                <DropdownMenuItem key={f.id} onSelect={() => setFlag.mutate(f.id)}>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', f.dotClass)} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{f.label}</span>
                    <span className="block text-role-micro normal-case tracking-normal text-text-soft">
                      {f.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!current} onSelect={() => setFlag.mutate(null)}>
                Clear flag
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {setFlag.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-text-soft" aria-hidden />
          ) : current && flagSetBy ? (
            <HoverTooltip label="Flags are shared — everyone in the org sees this" focusable={false}>
              <span className="truncate text-role-micro uppercase tracking-widest text-text-soft">
                Set by {flagSetBy}
              </span>
            </HoverTooltip>
          ) : null}
        </div>
      </div>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      <OrderNotesTrail orderId={orderId} legacyNote={legacyNote} />
    </section>
  );
}
