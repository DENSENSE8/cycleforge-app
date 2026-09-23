'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Package,
  Clock,
  Check,
  Clipboard,
  Copy,
  X,
  ExternalLink,
} from '@/components/Icons';
import {
  MobileCard,
  TOKENS,
  BentoItem,
  SectionHeader,
} from '@/components/mobile/redesign/DesignSystem';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { Button, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import { useRouter } from 'next/navigation';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { toast } from '@/lib/toast';

interface ActivityEntry {
  event_at: string | null;
  work_type: string | null;
  status: string | null;
  actor_name: string | null;
}

interface OrderVM {
  id: number;
  orderId: string;
  status: string | null;
  product: string;
  sku: string | null;
  quantity: number;
  source: string | null;
  customerName: string | null;
  address: string | null;
  createdAt: string | null;
  shipByDate: string | null;
  serials: string[];
  activity: ActivityEntry[];
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function joinAddress(...parts: Array<string | null | undefined>): string | null {
  const a = parts.filter(Boolean).join(', ').trim();
  return a.length > 0 ? a : null;
}

export default function RedesignedMobileOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderVM | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      // The mobile detail endpoint keys on the string order_id and returns the
      // richest shape (customer, address, activity). Scan deep-links use it
      // directly; pick-queue passes the numeric pk, so fall back to the record
      // route when the string lookup misses.
      let vm: OrderVM | null = null;

      const lookupRes = await fetch(`/api/orders/lookup/${encodeURIComponent(orderId)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (lookupRes.ok) {
        const data = await lookupRes.json();
        const o = data.order;
        vm = {
          id: o.id,
          orderId: o.order_id,
          status: o.status,
          product: o.product_title || 'Untitled product',
          sku: o.sku,
          quantity: Number(o.quantity) || 0,
          source: o.account_source,
          customerName: o.customer_name,
          address: joinAddress(o.ship_to_city, o.ship_to_state, o.ship_to_postal_code),
          createdAt: o.created_at || o.order_date,
          shipByDate: o.ship_by_date,
          serials: Array.isArray(o.serials) ? o.serials : [],
          activity: Array.isArray(data.activity) ? data.activity : [],
        };
      } else if (/^\d+$/.test(orderId)) {
        const recRes = await fetch(`/api/orders/${orderId}`, { credentials: 'include', cache: 'no-store' });
        if (recRes.ok) {
          const data = await recRes.json();
          const o = data.order;
          if (o) {
            vm = {
              id: o.id,
              orderId: o.order_id,
              status: o.status,
              product: o.product_title || 'Untitled product',
              sku: o.sku,
              quantity: Number(o.quantity) || 0,
              source: o.account_source,
              customerName: null,
              address: null,
              createdAt: o.created_at,
              shipByDate: null,
              serials: [],
              activity: [],
            };
          }
        }
      }

      if (vm) {
        setOrder(vm);
        setState('ready');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyId = useCallback(() => {
    const id = order?.orderId || orderId;
    navigator.clipboard?.writeText(id).then(
      () => toast.success(`Copied ${id}`),
      () => toast.error('Copy failed'),
    );
  }, [order, orderId]);

  if (state === 'loading') {
    return (
      <div className={`min-h-screen ${TOKENS.colors.background} flex items-center justify-center`}>
        <div className={cn('h-8 w-8 animate-spin border-2 border-border-soft border-t-border-accent', cornerClass('pill'))} />
      </div>
    );
  }

  if (state === 'error' || !order) {
    return (
      <div className={`min-h-screen ${TOKENS.colors.background} px-4 pt-2`}>
        <div className="flex items-center justify-between py-2 px-1">
          <IconButton
            icon={<X className="h-5 w-5 text-text-faint" />}
            onClick={() => router.back()}
            ariaLabel="Go back"
            size="touch"
            radius="flush"
            className="border border-border-soft bg-surface-card"
          />
        </div>
        <MobileCard className="mt-10 py-12 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-text-faint" />
          <p className="text-sm font-semibold text-text-default">Order not found</p>
          <p className="mt-1 text-xs font-medium text-text-muted">
            Couldn&apos;t load <span className="font-mono">{orderId}</span>.
          </p>
        </MobileCard>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${TOKENS.colors.background} px-4 pb-40 pt-2`}>
      {/* Header */}
      <div className="flex items-center justify-between py-2 px-1">
        <IconButton
          icon={<X className="h-5 w-5 text-text-faint" />}
          onClick={() => router.back()}
          ariaLabel="Go back"
          size="touch"
          radius="flush"
          className="border border-border-soft bg-surface-card"
        />
        <div className="flex items-center gap-2">
          {order.status && (
            <div className="border border-border-soft bg-surface-sunken px-3 py-1.5 text-role-eyebrow uppercase tracking-[0.1em] text-text-default">
              {order.status}
            </div>
          )}
          <IconButton
            icon={<Copy className="h-5 w-5 text-text-muted" />}
            onClick={copyId}
            ariaLabel="Copy order number"
            size="touch"
            radius="flush"
            className="border border-border-soft bg-surface-card"
          />
        </div>
      </div>

      <header className="px-1 pt-1 pb-3">
        <div className="flex items-center gap-1.5">
          <OrderIdChip value={order.orderId} display={getLast8(order.orderId)} />
          {(() => {
            const extUrl = getExternalUrlByItemNumber(order.sku);
            return (
              <HoverTooltip label={extUrl ? 'Open listing' : 'No listing link'} asChild>
                <IconButton
                  icon={<ExternalLink className="h-4 w-4 text-text-soft" />}
                  disabled={!extUrl}
                  onClick={() => extUrl && window.open(extUrl, '_blank', 'noopener,noreferrer')}
                  ariaLabel="Open listing in new tab"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none hover:bg-surface-sunken"
                />
              </HoverTooltip>
            );
          })()}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-text-muted">
          {(() => {
            const platformMeta = sourcePlatformMeta(order.source);
            return platformMeta.value ? (
              <HoverTooltip label={platformMeta.label} asChild focusable={false}>
                <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
                  <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
                </span>
              </HoverTooltip>
            ) : null;
          })()}
          <span>Created {fmtDate(order.createdAt)}</span>
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 mt-2">
        {/* Product Card */}
        <BentoItem title="Product" icon={Package} className="col-span-2" variant="glass">
          <p className="text-base font-semibold text-text-default leading-snug tracking-tight">{order.product}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {order.sku && (
              <span className="text-role-micro uppercase tracking-wider bg-surface-sunken text-text-muted px-2.5 py-1 rounded-none border border-border-soft font-mono">
                {order.sku}
              </span>
            )}
            <span className="border border-border-success bg-surface-success px-2.5 py-1 text-role-micro uppercase tracking-wider text-text-success">
              {order.quantity} Unit{order.quantity === 1 ? '' : 's'}
            </span>
            {order.serials.length > 0 && (
              <span className="text-role-micro uppercase tracking-wider bg-surface-canvas text-text-muted px-2.5 py-1 rounded-none border border-border-soft">
                {order.serials.length} Serial{order.serials.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </BentoItem>

        {/* Timeline */}
        <div className="col-span-2 mt-4">
          <SectionHeader title="Activity Timeline" />
          <MobileCard className="py-5">
            {order.activity.length === 0 ? (
              <p className="py-2 text-center text-role-caption font-semibold uppercase tracking-widest text-text-faint">
                No recorded activity yet
              </p>
            ) : (
              <div className="space-y-6">
                {order.activity.map((ev, i) => (
                  <div key={i} className="flex gap-4 items-start pl-1 relative">
                    {i < order.activity.length - 1 && (
                      <div className="absolute left-[10px] top-6 bottom-[-24px] w-px bg-surface-sunken" />
                    )}
                    <div className="relative mt-1 shrink-0">
                      <div className={cn('relative z-10 h-2.5 w-2.5', cornerClass('pill'), i === 0 ? 'bg-fill-info' : 'bg-surface-sunken')} />
                      {i === 0 && <div className={cn('absolute -inset-1.5 animate-ping bg-surface-accent/20', cornerClass('pill'))} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text-default uppercase tracking-tight">
                        {[ev.work_type, ev.status].filter(Boolean).join(' · ') || 'Update'}
                      </p>
                      <p className="text-role-micro text-text-faint uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {fmtDateTime(ev.event_at)}
                        {ev.actor_name ? ` • ${ev.actor_name}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </MobileCard>
        </div>
      </div>

      {/* Sticky Bottom Actions — nav moved to the left drawer, so these sit on the
          bottom edge (just clearing the home-indicator safe area). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-sticky border-t border-border-hairline bg-surface-card px-6 pb-3 pt-3">
        <div className="flex gap-3 pointer-events-auto">
          <Button
            variant="secondary"
            size="lg"
            radius="flush"
            className="h-14 w-14 px-0"
            onClick={copyId}
            icon={<Clipboard className="h-5 w-5" />}
            ariaLabel="Copy order number"
          />
          <Button
            variant="primary"
            size="lg"
            radius="flush"
            className="h-14 flex-1"
            onClick={() => router.back()}
            icon={<Check className="h-5 w-5" />}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
