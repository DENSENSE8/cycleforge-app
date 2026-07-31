'use client';

/**
 * OrderWarrantySummary — dimensional warranty card for the order record rail.
 *
 * Coverage verdict + claim count + actions. Does NOT reprint order # /
 * customer / serial already shown on the record (identity + Item + Customer).
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

export function OrderWarrantySummary({ order }: { order: ShippedOrder }) {
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);

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

  const orderClaims = useMemo(() => {
    const pk = Number(order.id);
    if (Number.isFinite(pk) && pk > 0) {
      const matched = claims.filter((c) => c.orderId === pk);
      if (matched.length > 0) return matched;
    }
    return claims;
  }, [claims, order.id]);

  return (
    <div className="stack-tight">
      <CoverageVerdict
        query={coverageQuery}
        coverage={coverage}
        isLoading={coverageLoading}
        isFetching={isFetching}
        onLogClaim={() => setLogOpen(true)}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Claims{!claimsLoading ? ` · ${orderClaims.length}` : ''}
        </p>
        <Link
          href={`/support?mode=warranty${claimsSearch ? `&search=${encodeURIComponent(claimsSearch)}` : ''}`}
          className="inline-flex items-center gap-1 text-role-caption font-semibold text-blue-600 hover:text-blue-800"
        >
          Logger <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {claimsLoading ? (
        <div className="flex items-center gap-2 py-2 text-role-caption text-text-faint">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : orderClaims.length === 0 ? (
        <Button variant="secondary" size="sm" onClick={() => setLogOpen(true)} className="w-full text-xs">
          + Log claim
        </Button>
      ) : (
        <ul className="divide-y divide-border-hairline overflow-hidden rounded-lg border border-border-soft">
          {orderClaims.slice(0, 3).map((claim) => (
            <li key={claim.id}>
              <Link
                href={`/support?mode=warranty&open=${claim.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2 transition hover:bg-surface-hover"
              >
                <p className="min-w-0 truncate font-mono text-role-micro text-text-muted">
                  {claim.claimNumber}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <WarrantyStatusBadge status={claim.status} />
                  <WarrantyClockChip daysRemaining={claim.daysRemaining} basis={claim.clockBasis} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

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

function CoverageVerdict({
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
      <p className="text-role-caption text-text-faint">
        No order number, serial, or SKU to check coverage against.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-role-caption text-text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking coverage…
      </div>
    );
  }

  if (!coverage || !coverage.found) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-role-caption text-text-soft">No coverage match.</p>
        <Button variant="secondary" size="sm" onClick={onLogClaim} className="shrink-0 text-xs">
          Log manually
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
        ? 'Last day'
        : `${coverage.daysRemaining}d left`
      : status === 'expired'
        ? `Expired ${Math.abs(coverage.daysRemaining ?? 0)}d ago`
        : 'No delivery date';

  const expires = coverage.warrantyExpiresAt ? formatDateTimePST(coverage.warrantyExpiresAt) : null;

  return (
    <div className={cn('rounded-lg ring-1 ring-inset p-3', tone.ring, tone.bg)}>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-card ring-1 ring-inset',
            tone.ring,
            tone.text,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 stack-tight">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-role-caption font-semibold', tone.text)}>{headline}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-role-micro font-semibold tabular-nums ring-1 ring-inset bg-surface-card',
                tone.ring,
                tone.text,
              )}
            >
              {sub}
            </span>
            {provisional ? (
              <HoverTooltip
                label="Provisional — based on packed date + delivery estimate; confirms when the carrier delivered date lands."
                asChild
              >
                <span className="rounded border border-dashed border-border-warning px-1 py-0.5 text-role-micro font-medium uppercase tracking-wide text-text-warning">
                  Est.
                </span>
              </HoverTooltip>
            ) : null}
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin text-text-faint" /> : null}
          </div>
          {expires ? (
            <p className="text-role-micro text-text-muted">Expires {expires}</p>
          ) : null}
          {coverage.existingClaim ? (
            <Link
              href={`/support?mode=warranty&open=${coverage.existingClaim.id}`}
              className="text-role-caption font-semibold text-blue-600 hover:text-blue-800"
            >
              View claim {coverage.existingClaim.claimNumber}
              <span className="ml-1 font-medium text-text-faint">
                · {WARRANTY_STATUS_LABEL[coverage.existingClaim.status]}
              </span>
            </Link>
          ) : (
            <Button variant="primary" size="sm" onClick={onLogClaim} className="w-fit text-xs">
              + Log claim
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
