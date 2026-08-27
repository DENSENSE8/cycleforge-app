'use client';

/**
 * Support · who is asking — the head of the ticket thread.
 *
 * The agent's first question on a ticket is not "what does this message say",
 * it is "who is this and what has already happened to them". That answer used
 * to be spread across three places: a name in the chat header, the linkage in a
 * rail display the operator had to open, and the order count nowhere at all.
 * This band is its one home, and it sits at the top of the conversation's own
 * scroll port — it is CONTEXT FOR the thread, so it scrolls away with the
 * thread. It is not chrome and must never be pinned.
 *
 * ## Five facts, and not a sixth
 *
 * name/email · linked order · tracking + serials + carton · order count ·
 * prior ticket count. **LTV and return rate are deliberately absent.** Neither
 * exists in this schema, and a placeholder number on a customer record is worse
 * than a missing one — an agent quotes it. `—` is the house honest-absence mark
 * and it is used here for a fact we could not resolve; a fact that has no
 * source at all gets no row.
 *
 * ## Where each fact comes from
 *
 * The linkage half is read off the `SupportContextBundle` the thread ALREADY
 * fetches (same query key, one more reader — never a second fetch). Only the
 * two counts and our `customers` row need a call of their own, and that call is
 * separate on purpose: it reaches the helpdesk search API, and the conversation
 * must not wait on a customer's ticket count.
 *
 * ## Absence is the common case
 *
 * Most tickets have no linked customer and no linked order. The band renders
 * its identity row and an honest "Not linked yet" line rather than collapsing —
 * a band that disappears when unlinked would teach the agent that linkage is
 * not a thing this surface has.
 */

import Link from 'next/link';
import { IdentityMark } from '@/components/identity';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { OrderIdChip, SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Box } from '@/components/Icons';
import { useRequesterProfile } from '@/hooks/useRequesterProfile';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { supportOrdersHref } from '@/components/sidebar/support/support-sidebar-shared';
import { cn } from '@/utils/_cn';

/** House honest-absence mark — never `N/A`, never a fabricated `0`. */
const DASH = '—';

function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  /** `null` ⇒ we could not resolve it. Renders `—`, not a zero. */
  value: number | null;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</span>
      <span
        className={cn(
          'text-role-caption font-semibold tabular-nums',
          value == null ? 'text-text-faint' : 'text-text-default',
          loading && 'animate-pulse text-text-faint',
        )}
      >
        {loading ? DASH : (value ?? DASH)}
      </span>
    </div>
  );
}

export function RequesterDetailBand({
  ticketId,
  bundle,
  /** Station densities (Unbox 360px push) tighten padding and drop the counts. */
  compact = false,
  className,
}: {
  ticketId: number;
  bundle: SupportContextBundle | undefined;
  compact?: boolean;
  className?: string;
}) {
  // The counts are the only thing that needs its own round trip; on a 360px
  // station push there is no room for them, so we do not pay for them either.
  const { data: profile, isLoading } = useRequesterProfile(ticketId, !compact);

  const name = profile?.customer?.displayName || profile?.name || null;
  const email = profile?.email || profile?.customer?.email || null;
  const displayName = name || email || 'Requester';

  const order = bundle?.linkage.order ?? null;
  const orderHref = order?.id != null && order.id > 0 ? supportOrdersHref(order.id) : null;
  const tracking =
    bundle?.linkage.trackings.find((t) => t.isPrimary)?.tracking ??
    bundle?.linkage.trackings[0]?.tracking ??
    bundle?.linkable?.trackingNumber ??
    null;
  const serials = bundle?.linkage.serials ?? [];
  const receivingId = bundle?.linkable?.receivingId ?? null;

  const hasLinkage = Boolean(order || tracking || serials.length || receivingId);

  return (
    <div
      data-testid="support-requester-band"
      className={cn(
        'border-b border-border-hairline bg-surface-card',
        compact ? 'px-2.5 py-2' : 'px-5 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <IdentityMark
          initials={staffInitials(displayName)}
          size={compact ? 'sm' : 'md'}
          alt={displayName}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-role-caption font-semibold text-text-default">
            {displayName}
          </p>
          <p className="truncate text-role-micro text-text-soft">
            {email ?? <span className="text-text-faint">{DASH}</span>}
          </p>
        </div>
        {compact ? null : (
          <div className="flex shrink-0 items-center gap-5">
            <Stat label="Orders" value={profile?.orderCount ?? null} loading={isLoading} />
            <Stat label="Tickets" value={profile?.ticketCount ?? null} loading={isLoading} />
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {hasLinkage ? (
          <>
            {order?.orderId ? (
              orderHref ? (
                <Link href={orderHref} className="max-w-full">
                  <OrderIdChip value={order.orderId} display={order.orderId} dense />
                </Link>
              ) : (
                <OrderIdChip value={order.orderId} display={order.orderId} dense />
              )
            ) : null}
            {tracking ? <TrackingChip value={tracking} dense /> : null}
            {serials.slice(0, 2).map((s) => (
              <SerialChip key={s.serial} value={s.serial} width="w-fit shrink-0" dense />
            ))}
            {serials.length > 2 ? (
              <span className="text-role-micro text-text-soft">
                +{serials.length - 2} more
              </span>
            ) : null}
            {receivingId ? (
              <HoverTooltip label="Open the carton record" asChild>
                <Link
                  href={`/carton/${receivingId}`}
                  className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft transition-colors hover:text-text-default"
                >
                  <Box className="h-3 w-3" />
                  Carton {receivingId}
                </Link>
              </HoverTooltip>
            ) : null}
          </>
        ) : (
          <span className="text-role-micro text-text-faint">
            Not linked to an order, tracking, or carton yet
          </span>
        )}
      </div>
    </div>
  );
}
