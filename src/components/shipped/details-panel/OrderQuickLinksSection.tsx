'use client';

import Link from 'next/link';
import { ExternalLink } from '@/components/Icons';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { DetailsPanelRow } from '@/design-system/components/DetailsPanelRow';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { WarrantyClockChip } from '@/components/warranty/chips';
import { useWarrantyCoverage } from '@/hooks/useWarrantyClaims';

const QUICK_LINK_CLASS =
  'inline-flex shrink-0 items-center gap-1 text-role-caption font-semibold text-blue-600 hover:text-blue-800';

/**
 * Slide-over replacement for the Customer / Warranty tabs: one fact row each
 * with a link out to the warranty logger. Keeps the panel glanceable.
 */
export function OrderQuickLinksSection({ shipped }: { shipped: ShippedOrder }) {
  const orderNo = String(shipped.order_id || '').trim();
  const { data: coverage } = useWarrantyCoverage(orderNo);

  const warrantyHref = `/support?mode=warranty${orderNo ? `&search=${encodeURIComponent(orderNo)}` : ''}`;
  const hasCoverage = Boolean(coverage?.found);
  const verdict =
    coverage?.inWarranty === true ? 'Active' : coverage?.inWarranty === false ? 'Expired' : null;
  const verdictTone =
    coverage?.inWarranty === true ? 'success' : coverage?.inWarranty === false ? 'danger' : 'soft';

  return (
    <section className="space-y-0">
      <DetailsPanelRow label="Warranty">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {verdict ? (
              <LedgerValue value={verdict} tone={verdictTone} truncate />
            ) : (
              <LedgerValue value={hasCoverage ? 'Unknown' : null} truncate />
            )}
            {hasCoverage && coverage?.daysRemaining != null ? (
              <WarrantyClockChip
                daysRemaining={coverage.daysRemaining}
                basis={coverage.clockBasis}
              />
            ) : null}
          </div>
          <Link href={warrantyHref} className={QUICK_LINK_CLASS}>
            Open warranty logger <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </DetailsPanelRow>

      <DetailsPanelRow label="Customer">
        <LedgerValue value={coverage?.customerName ?? null} truncate />
      </DetailsPanelRow>
    </section>
  );
}
