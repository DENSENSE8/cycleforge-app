'use client';

/**
 * Search-order identity — the condensed one-row bookmark content (box icon ·
 * ORDER # · title · status/platform/condition chips · tracking · Trace). Mounts
 * inside {@link SearchOrderContextBar}'s bookmark chrome. Never ShippedDetailsHeader.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin, Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { conditionLabel } from '@/lib/conditions';
import { journeyHandoffHref } from '@/lib/search/search-hit';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';
import { cn } from '@/utils/_cn';

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

type ChipTone = 'neutral' | 'accent' | 'success';

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunken text-text-soft ring-border-soft',
  accent: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

function IdentityChip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-role-micro font-bold uppercase tracking-widest ring-1 ring-inset',
        CHIP_TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

export function SearchOrderDetailHeader({ order }: { order: ShippedOrder }) {
  const [copied, setCopied] = useState(false);
  const orderChannelLabel = useOrderChannelLabel();

  const orderIdDisplay = String(order.order_id || '').trim() || String(order.id);
  const showExceptions = !String(order.order_id || '').trim();
  const traceHref = journeyHandoffHref({ id: order.id, entityType: 'order' });

  const platform = orderChannelLabel(order.order_id || '', order.account_source);
  const condition = order.condition ? conditionLabel(order.condition, 'table') : '';
  const isShipped = order.is_delivered || order.is_shipped;
  const status = firstNonEmpty(
    order.latest_status_label,
    order.shipment_status,
    order.is_delivered ? 'Delivered' : '',
    order.is_shipped ? 'Shipped' : '',
    'Open',
  );
  const tracking = firstNonEmpty(
    order.shipping_tracking_number,
    ...(order.tracking_numbers ?? []),
  );
  const trackingLast4 = tracking ? tracking.replace(/\s+/g, '').slice(-4) : '';

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  const handleCopyOrder = async () => {
    await handleCopy(orderIdDisplay, 'Order #');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-3 px-3 py-1.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
        <Package className="h-4 w-4 text-white" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
          {showExceptions ? 'Exceptions' : 'Order #'}
        </p>
        <div className="flex min-w-0 items-baseline gap-2">
          <HoverTooltip label={copied ? 'Copied' : 'Click to copy'} asChild>
            {/* ds-raw-button: click-to-copy identity value, not a styled CTA */}
            <button
              type="button"
              onClick={() => void handleCopyOrder()}
              className="shrink-0 truncate text-left text-role-body font-bold text-text-default transition-colors hover:text-blue-700"
              aria-label={`Copy ${orderIdDisplay}`}
            >
              {orderIdDisplay}
              {copied ? <span className="ml-1 text-text-success">✓</span> : null}
            </button>
          </HoverTooltip>
          {order.product_title ? (
            <span className="min-w-0 truncate text-role-caption font-medium text-text-muted">
              {order.product_title}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <IdentityChip label={status} tone={isShipped ? 'success' : 'accent'} />
        {platform ? <IdentityChip label={platform} /> : null}
        {condition ? <IdentityChip label={condition} /> : null}

        {trackingLast4 ? (
          <HoverTooltip label={`Copy tracking · ${tracking}`} asChild>
            {/* ds-raw-button: click-to-copy tracking chip */}
            <button
              type="button"
              onClick={() => void handleCopy(tracking, 'Tracking')}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-role-micro font-bold tabular-nums text-text-soft ring-1 ring-inset ring-border-soft transition-colors hover:text-text-default"
              aria-label={`Copy tracking ${tracking}`}
            >
              <MapPin className="h-3 w-3 text-blue-500" />
              {trackingLast4}
            </button>
          </HoverTooltip>
        ) : null}

        {traceHref ? (
          <HoverTooltip label="Open journey Trace" asChild>
            <Link
              href={traceHref}
              aria-label="Open journey Trace"
              className="inline-flex shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </HoverTooltip>
        ) : null}
      </div>
    </div>
  );
}
