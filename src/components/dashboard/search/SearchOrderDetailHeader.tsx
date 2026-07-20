'use client';

/**
 * Search-order detail header — order identity + copy + optional Trace link.
 * Composes PageHeader primitives; never ShippedDetailsHeader.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Package } from '@/components/Icons';
import { PageHeader } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { journeyHandoffHref } from '@/lib/search/search-hit';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';

export function SearchOrderDetailHeader({ order }: { order: ShippedOrder }) {
  const [copied, setCopied] = useState(false);
  const orderIdDisplay = String(order.order_id || '').trim() || String(order.id);
  const showExceptions = !String(order.order_id || '').trim();
  const traceHref = journeyHandoffHref({ id: order.id, entityType: 'order' });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(orderIdDisplay);
      setCopied(true);
      toast.success('Order # copied');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <PageHeader
      eyebrow={showExceptions ? 'Exceptions' : 'Order #'}
      value={
        <HoverTooltip label={copied ? 'Copied' : 'Click to copy'} asChild>
          {/* ds-raw-button: click-to-copy identity value, not a styled CTA */}
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="truncate text-left transition-colors hover:text-blue-700"
            aria-label={`Copy ${orderIdDisplay}`}
          >
            {orderIdDisplay}
            {copied ? <span className="ml-1 text-text-success">✓</span> : null}
          </button>
        </HoverTooltip>
      }
      valueTitle={orderIdDisplay}
      icon={Package}
      iconBg="bg-blue-600"
      iconTint="text-white"
      rightSlot={
        traceHref ? (
          <HoverTooltip label="Open journey Trace" asChild>
            <Link
              href={traceHref}
              aria-label="Open journey Trace"
              className="inline-flex rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </HoverTooltip>
        ) : null
      }
    />
  );
}
