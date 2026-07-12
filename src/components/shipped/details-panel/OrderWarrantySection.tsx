'use client';

/**
 * Order-scoped warranty tab for `/o/[orderId]` and the search-embedded order pane.
 * Coverage-first phone script: verdict → days left → clock facts → claims for
 * this order → Log claim / open in Support Warranty Logger.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock, ExternalLink, Loader2, ShieldCheck } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WarrantyLogClaimDialog } from '@/components/warranty/WarrantyLogClaimDialog';
import { WarrantyClockChip, WarrantyStatusBadge } from '@/components/warranty/chips';
import { useWarrantyClaims, useWarrantyCoverage } from '@/hooks/useWarrantyClaims';
import { WARRANTY_STATUS_LABEL } from '@/lib/warranty/types';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

export function OrderWarrantySection({ order }: { order: ShippedOrder }) {
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);

  // Prefer human order # for lookup (matches phone script + coverage API);
  // fall back to first serial, then SKU.
  const coverageQuery = useMemo(() => {
    const orderNo = String(order.order_id || '').trim();
    if (orderNo) return orderNo;
    const serial = String(order.serial_number || '')
      .split(',')
      .map((s) => s.trim())
      .find(Boolean);
    if (serial) return serial;
    return String(order.sku || '').trim();
  }, [order.order_id, order.serial_number, order.sku]);

  const claimsSearch = useMemo(() => {
    const orderNo = String(order.order_id || '').trim();
    if (orderNo) return orderNo;
    return coverageQuery;
  }, [coverageQuery, order.order_id]);

  const { data: coverage, isLoading: coverageLoading, isFetching } = useWarrantyCoverage(coverageQuery);
  const { data: claims = [], isLoading: claimsLoading } = useWarrantyClaims({
    search: claimsSearch,
  });

  // Prefer claims that match this order row when we have a numeric pk.
  const orderClaims = useMemo(() => {
    const pk = Number(order.id);
    if (Number.isFinite(pk) && pk > 0) {
      const matched = claims.filter((c) => c.orderId === pk);
      if (matched.length > 0) return matched;
    }
    return claims;
  }, [claims, order.id]);

  return (
    <div className="flex min-h-full flex-col gap-4 pb-8 pt-4">
      <CoverageBlock
        query={coverageQuery}
        coverage={coverage}
        isLoading={coverageLoading}
        isFetching={isFetching}
        onLogClaim={() => setLogOpen(true)}
      />

      <section className="rounded-xl border border-border-soft bg-surface-card">
        <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-4 py-2.5">
          <p className="text-eyebrow font-black uppercase tracking-widest text-text-soft">
            Claims for this order
          </p>
          <Link
            href={`/support?mode=warranty${claimsSearch ? `&search=${encodeURIComponent(claimsSearch)}` : ''}`}
            className="inline-flex items-center gap-1 text-caption font-semibold text-blue-600 hover:text-blue-800"
          >
            Open warranty logger <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {claimsLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading claims…
          </div>
        ) : orderClaims.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-text-faint">
            No warranty claims logged for this order yet.
            <div className="mt-3">
              <Button variant="primary" size="sm" onClick={() => setLogOpen(true)} className="text-xs">
                + Log claim
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {orderClaims.map((claim) => (
              <li key={claim.id}>
                <Link
                  href={`/support?mode=warranty&open=${claim.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-caption font-bold text-text-default">
                      {claim.productTitle || claim.sku || claim.serialNumber || claim.claimNumber}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-micro text-text-faint">
                      {claim.claimNumber}
                      {claim.serialNumber ? ` · ${claim.serialNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <WarrantyStatusBadge status={claim.status} />
                    <WarrantyClockChip daysRemaining={claim.daysRemaining} basis={claim.clockBasis} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WarrantyLogClaimDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onCreated={(id) => {
          router.push(`/support?mode=warranty&open=${id}`);
        }}
        initial={{
          orderId: Number(order.id) || undefined,
          serialNumber: String(order.serial_number || '')
            .split(',')
            .map((s) => s.trim())
            .find(Boolean),
          sku: order.sku || undefined,
          productTitle: order.product_title || undefined,
        }}
      />
    </div>
  );
}

function CoverageBlock({
  query,
  coverage,
  isLoading,
  isFetching,
  onLogClaim,
}: {
  query: string;
  coverage: ReturnType<typeof useWarrantyCoverage>['data'];
  isLoading: boolean;
  isFetching: boolean;
  onLogClaim: () => void;
}) {
  if (!query) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-sm text-text-faint">
        This order has no order number, serial, or SKU to check coverage against.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border-soft bg-surface-card px-4 py-4 text-sm text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking warranty coverage…
      </div>
    );
  }

  if (!coverage || !coverage.found) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface-card px-4 py-4">
        <p className="text-sm text-text-soft">
          No shipped coverage match for “
          <span className="font-medium text-text-muted">{query}</span>”.
        </p>
        <Button variant="secondary" size="sm" onClick={onLogClaim} className="shrink-0 text-xs">
          Log claim manually
        </Button>
      </div>
    );
  }

  const provisional = coverage.clockBasis === 'PACKED_PLUS_ESTIMATE';
  const status =
    coverage.inWarranty === true ? 'covered' : coverage.inWarranty === false ? 'expired' : 'unknown';
  const tone =
    status === 'covered'
      ? { ring: 'ring-border-success', bg: 'bg-surface-success', text: 'text-text-success', icon: ShieldCheck }
      : status === 'expired'
        ? { ring: 'ring-border-danger', bg: 'bg-surface-danger', text: 'text-text-danger', icon: AlertCircle }
        : { ring: 'ring-border-warning', bg: 'bg-surface-warning', text: 'text-text-warning', icon: Clock };
  const Icon = tone.icon;
  const headline =
    status === 'covered' ? 'In warranty' : status === 'expired' ? 'Out of warranty' : 'Coverage unknown';
  const sub =
    status === 'covered'
      ? coverage.daysRemaining === 0
        ? 'Last day of coverage'
        : `${coverage.daysRemaining} day${coverage.daysRemaining === 1 ? '' : 's'} left`
      : status === 'expired'
        ? `Expired ${Math.abs(coverage.daysRemaining ?? 0)} day${Math.abs(coverage.daysRemaining ?? 0) === 1 ? '' : 's'} ago`
        : 'No delivery date on file yet';

  return (
    <div className={cn('rounded-xl ring-1 ring-inset p-4', tone.ring, tone.bg)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card ring-1 ring-inset',
            tone.ring,
            tone.text,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-semibold', tone.text)}>{headline}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums ring-1 ring-inset bg-surface-card',
                tone.ring,
                tone.text,
              )}
            >
              {sub}
            </span>
            {provisional && (
              <HoverTooltip
                label="Provisional — based on packed date + delivery estimate; confirms when the carrier delivered date lands."
                asChild
              >
                <span className="rounded border border-dashed border-border-warning px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-text-warning">
                  Est.
                </span>
              </HoverTooltip>
            )}
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" />}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-label sm:grid-cols-3">
            <Fact label="Order #" value={coverage.sourceOrderId} mono />
            <Fact label="Customer" value={coverage.customerName} />
            <Fact
              label={provisional ? 'Est. delivered' : 'Delivered'}
              value={fmt(coverage.deliveredAt ?? coverage.warrantyStartsAt)}
            />
            <Fact label="Expires" value={fmt(coverage.warrantyExpiresAt)} />
            <Fact label="Term" value={coverage.warrantyDays ? `${coverage.warrantyDays} days` : null} />
            <Fact
              label={coverage.serialNumber ? 'Serial' : 'SKU'}
              value={coverage.serialNumber || coverage.sku}
              mono
            />
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {coverage.existingClaim ? (
              <>
                <Link href={`/support?mode=warranty&open=${coverage.existingClaim.id}`}>
                  <Button variant="primary" size="sm" className="text-xs">
                    View claim {coverage.existingClaim.claimNumber}
                  </Button>
                </Link>
                <span className="text-caption text-text-faint">
                  Already logged · {WARRANTY_STATUS_LABEL[coverage.existingClaim.status]}
                </span>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={onLogClaim} className="text-xs">
                + Log claim
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro font-medium uppercase tracking-wide text-text-faint">{label}</dt>
      <dd className={cn('truncate text-text-muted', mono && 'font-mono text-caption')}>
        {value || <span className="text-text-faint">—</span>}
      </dd>
    </div>
  );
}

function fmt(value: string | null | undefined): string | null {
  if (!value) return null;
  return formatDateTimePST(value);
}
