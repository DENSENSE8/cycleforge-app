'use client';

/**
 * LinkedTicketsPanel — the closed-loop linkage display: given any one of
 * {order#, tracking#, serial#}, render the composed loop (order ↔ tracking[] ↔
 * serial[]) plus the Zendesk support tickets linked anywhere on it.
 *
 * Reused verbatim on the packing station and receiving surfaces. It is a dumb
 * display: it fetches `/api/order-linkage` and renders through the CopyChip SoT
 * (OrderIdChip / TrackingChip / SerialChip / TicketChip) — no linkage logic
 * lives here (that is `src/lib/order-linkage.ts`).
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderLinkage } from '@/lib/order-linkage';
import { OrderIdChip, TrackingChip, SerialChip, TicketChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface LinkedTicketsPanelProps {
  order?: string | null;
  tracking?: string | null;
  serial?: string | null;
  /** Compact variant for tight sidebars (smaller header, tighter gaps). */
  dense?: boolean;
  /**
   * Render nothing until a real linked order resolves (no header, no empty box).
   * Use on surfaces where most rows have no outbound loop — e.g. receiving,
   * where only a returned serial resolves — so the panel stays silent otherwise.
   */
  hideWhenEmpty?: boolean;
  /** Host already owns ticket identity (e.g. Support Context header/actions). */
  hideTickets?: boolean;
  /**
   * Order-body strip: omit Order/Tracking/Serial rows (host already shows them)
   * and only render linked tickets. Silent when there are none.
   */
  ticketsOnly?: boolean;
  /**
   * Where ticket chips navigate.
   *   - `zendesk` (default) — provider open URL when present
   *   - `support` — in-app `/support?ticket=…` Timeline / Connections
   */
  ticketNav?: 'zendesk' | 'support';
  /**
   * `card` — rounded dashed empty/error islands (packing / receiving embeds).
   * `flush` — plain full-width caption rows for right-rail bands; still shows the
   * Linkage eyebrow when nothing is linked yet (Connections empty state).
   */
  surface?: 'card' | 'flush';
  className?: string;
}

function supportTicketHref(tk: {
  zendeskTicketId: number | null;
  label: string;
}): string | null {
  const fromId = tk.zendeskTicketId;
  if (fromId != null && Number.isFinite(fromId) && fromId > 0) {
    return `/support?ticket=${fromId}`;
  }
  const digits = tk.label.replace(/\D/g, '');
  return digits ? `/support?ticket=${digits}` : null;
}

/** Debounce a value so live-typed identifiers (e.g. a serial being scanned) do
 *  not fire a resolve request on every keystroke. */
function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const last8 = (v: string | null | undefined): string => {
  const s = String(v ?? '').trim();
  return s.length <= 8 ? s || '—' : s.slice(-8);
};

/**
 * One labelled row of the loop — an eyebrow naming the identifier KIND, then its
 * chips. Absent facts render nothing (honest absence): a "Serial —" row on an
 * order that has no serial yet would be noise, not information.
 */
function LoopRow({ label, children }: { label: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-16 shrink-0 text-role-eyebrow uppercase tracking-widest text-text-faint">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{items}</div>
    </div>
  );
}

function statusDotClass(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s.includes('solved') || s.includes('closed')) return 'bg-emerald-500';
  if (s.includes('pending')) return 'bg-amber-500';
  if (s.includes('open') || s.includes('new')) return 'bg-rose-500';
  return 'bg-surface-strong';
}

export function LinkedTicketsPanel({
  order,
  tracking,
  serial,
  dense = false,
  hideWhenEmpty = false,
  hideTickets = false,
  ticketsOnly = false,
  ticketNav = 'zendesk',
  surface = 'card',
  className = '',
}: LinkedTicketsPanelProps) {
  const flush = surface === 'flush';
  const dOrder = useDebounced((order ?? '').trim());
  const dTracking = useDebounced((tracking ?? '').trim());
  const dSerial = useDebounced((serial ?? '').trim());
  const enabled = Boolean(dOrder || dTracking || dSerial);

  const { data, isLoading, isError } = useQuery<OrderLinkage>({
    queryKey: ['order-linkage', dOrder, dTracking, dSerial],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dOrder) params.set('order', dOrder);
      if (dTracking) params.set('tracking', dTracking);
      if (dSerial) params.set('serial', dSerial);
      const res = await fetch(`/api/order-linkage?${params.toString()}`);
      if (!res.ok) throw new Error(`order-linkage ${res.status}`);
      const json = await res.json();
      return json.linkage as OrderLinkage;
    },
  });

  // Flush Connections: keep the Linkage eyebrow + plain empty caption when
  // nothing is linked yet. Card embeds stay silent until an identifier lands.
  if (!enabled) {
    if (!flush || hideWhenEmpty || ticketsOnly) return null;
    return (
      <section className={className || undefined} aria-label="Linkage">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Linkage</p>
        <p className="mt-1.5 text-role-caption text-text-faint">
          No linked order or tracking yet.
        </p>
      </section>
    );
  }
  // Silent on surfaces where most rows have no outbound loop (receiving).
  if (hideWhenEmpty && (!data || !data.order)) return null;

  const tickets = data?.tickets ?? [];
  if (ticketsOnly) {
    if (isLoading) return null;
    if (isError || tickets.length === 0) return null;
  }

  const headerCls = dense
    ? 'text-role-eyebrow uppercase tracking-widest text-text-soft'
    : 'text-role-eyebrow uppercase tracking-widest text-text-soft';

  // When order-linkage cannot resolve an order (common for ticket-only tracking
  // bridges), still surface identifiers we already know from the host anchor.
  const fallbackTrackings =
    dTracking && !(data?.trackings ?? []).some((t) => t.tracking === dTracking)
      ? [
          {
            shipmentId: 0,
            tracking: dTracking,
            isPrimary: true,
            carrier: null,
            statusCategory: null,
            isDelivered: null,
          },
        ]
      : [];
  const fallbackSerials =
    dSerial && !(data?.serials ?? []).some((s) => s.serial === dSerial)
      ? [{ serialUnitId: null, serial: dSerial, state: null }]
      : [];

  const loopTrackings = [...(data?.trackings ?? []), ...fallbackTrackings].filter((t) =>
    Boolean(t.tracking?.trim()),
  );
  const loopSerials = [...(data?.serials ?? []), ...fallbackSerials].filter((s) =>
    Boolean(s.serial?.trim()),
  );
  const hasLoop = Boolean(data?.order || loopTrackings.length > 0 || loopSerials.length > 0);

  const ticketList = (
    <ul className="divide-y divide-border-hairline">
      {tickets.map((tk) => {
        const href =
          ticketNav === 'support'
            ? supportTicketHref(tk)
            : tk.openUrl ?? supportTicketHref(tk);
        const external = ticketNav !== 'support' && Boolean(tk.openUrl);
        return (
          <li
            key={tk.zendeskTicketId ?? tk.supportTicketId ?? tk.label}
            className="flex items-center gap-2 py-1.5"
          >
            <HoverTooltip label={tk.status ?? 'unknown status'} asChild focusable={false}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(tk.status)}`} />
            </HoverTooltip>
            {href ? (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                className="shrink-0"
              >
                <TicketChip value={tk.label} display={tk.label} />
              </a>
            ) : (
              <TicketChip value={tk.label} display={tk.label} />
            )}
            {tk.subject && (
              <span className="truncate text-role-caption text-text-muted">{tk.subject}</span>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (ticketsOnly) {
    return (
      <section className={`space-y-2 ${className}`} aria-label="Linked support tickets">
        <p className={headerCls}>Linked tickets</p>
        {ticketList}
      </section>
    );
  }

  const emptyError = flush ? (
    <p className="text-role-caption text-rose-600">Could not resolve linkage.</p>
  ) : (
    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-2 text-center text-role-caption text-rose-600">
      Could not resolve linkage.
    </div>
  );

  const emptyLoop = flush ? (
    <p className="text-role-caption text-text-faint">No linked order found.</p>
  ) : (
    <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-3 py-2 text-center text-role-caption text-text-faint">
      No linked order found.
    </div>
  );

  return (
    <section className={`space-y-2 ${className}`}>
      <p className={headerCls}>Linkage</p>

      {isLoading && (
        <div className="text-role-caption text-text-faint">Resolving links…</div>
      )}

      {isError && emptyError}

      {!isLoading && !isError && !hasLoop && emptyLoop}

      {!isLoading && !isError && hasLoop && (
        <div className="space-y-2">
          {/* The loop: order ↔ tracking[] ↔ serial[].
              Each KIND is named. Rendered as one undifferentiated chip run
              (until 2026-08-02) it read as "4790 · 33987359 · 220573AZ" with
              nothing saying which was the order, which the tracking and which
              the serial — three last-8 digit strings an operator had to guess
              at. The chips were already the typed CopyChip family; what was
              missing was the label track. */}
          <LoopRow label="Order">
            {data?.order?.orderId ? (
              <OrderIdChip value={data.order.orderId} display={data.order.orderId} dense />
            ) : null}
          </LoopRow>
          <LoopRow label="Tracking">
            {loopTrackings.map((t, i) =>
              t.tracking ? (
                <TrackingChip
                  key={`${t.shipmentId}-${t.tracking}-${i}`}
                  value={t.tracking}
                  display={last8(t.tracking)}
                  dense
                />
              ) : null,
            )}
          </LoopRow>
          <LoopRow label="Serial">
            {loopSerials.map((s, i) => (
              <SerialChip key={`${s.serialUnitId ?? 'tsn'}-${i}`} value={s.serial} dense />
            ))}
          </LoopRow>

          {/* Linked Zendesk tickets */}
          {!hideTickets ? (
            tickets.length === 0 ? (
              <div className="text-role-caption text-text-faint">No linked tickets.</div>
            ) : (
              ticketList
            )
          ) : null}
        </div>
      )}
    </section>
  );
}
