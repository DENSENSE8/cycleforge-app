'use client';

/** OrderWarrantySummary — order-scoped warranty card (coverage + claims + log). */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock, ExternalLink, Loader2, ShieldCheck } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WarrantyLogClaimDialog } from '@/components/warranty/WarrantyLogClaimDialog';
import { WarrantyClockChip, WarrantyStatusBadge } from '@/components/warranty/chips';
import { useWarrantyClaims, useWarrantyCoverage } from '@/hooks/useWarrantyClaims';
import {
  WARRANTY_STATUS_LABEL,
  type WarrantyClaimListRow,
  type WarrantyCoverageResult,
} from '@/lib/warranty/types';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

type OrderWarrantyDensity = 'compact' | 'pane';

const LOGGER_LINK_CLASS =
  'inline-flex items-center gap-1 text-role-caption font-semibold text-blue-600 hover:text-blue-800';

function coverageQueryFor(order: ShippedOrder): string {
  const orderNo = String(order.order_id || '').trim();
  if (orderNo) return orderNo;
  const serial = String(order.serial_number || '')
    .split(',')
    .map((s) => s.trim())
    .find(Boolean);
  if (serial) return serial;
  return String(order.sku || '').trim();
}

export function OrderWarrantySummary({
  order,
  density = 'compact',
}: {
  order: ShippedOrder;
  /** `pane` = exclusive order tab (clock facts + all claims). Default is the rail card. */
  density?: OrderWarrantyDensity;
}) {
  const router = useRouter();
  const [logOpen, setLogOpen] = useState(false);
  const pane = density === 'pane';

  const coverageQuery = useMemo(() => coverageQueryFor(order), [order]);
  const claimsSearch = useMemo(() => {
    const orderNo = String(order.order_id || '').trim();
    return orderNo || coverageQuery;
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

  const listedClaims = pane ? orderClaims : orderClaims.slice(0, 3);
  const loggerHref = `/support?mode=warranty${claimsSearch ? `&search=${encodeURIComponent(claimsSearch)}` : ''}`;

  const dialog = (
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
  );

  const verdict = (
    <CoverageVerdict
      density={density}
      query={coverageQuery}
      coverage={coverage}
      isLoading={coverageLoading}
      isFetching={isFetching}
      onLogClaim={() => setLogOpen(true)}
    />
  );

  if (pane) {
    return (
      <div className="flex min-h-full flex-col pb-8 pt-4">
        <div className="px-4">{verdict}</div>
        <section className="mt-4 border-y border-border-hairline">
          <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-4 py-2.5">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Claims for this order
            </p>
            <Link href={loggerHref} className={LOGGER_LINK_CLASS}>
              Open warranty logger <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <ClaimsBody
            density="pane"
            loading={claimsLoading}
            claims={listedClaims}
            onLogClaim={() => setLogOpen(true)}
          />
        </section>
        {dialog}
      </div>
    );
  }

  return (
    <div className="stack-tight">
      {verdict}
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Claims{!claimsLoading ? ` · ${orderClaims.length}` : ''}
        </p>
        <Link href={loggerHref} className={LOGGER_LINK_CLASS}>
          Logger <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <ClaimsBody
        density="compact"
        loading={claimsLoading}
        claims={listedClaims}
        onLogClaim={() => setLogOpen(true)}
      />
      {dialog}
    </div>
  );
}

function ClaimsBody({
  density,
  loading,
  claims,
  onLogClaim,
}: {
  density: OrderWarrantyDensity;
  loading: boolean;
  claims: readonly WarrantyClaimListRow[];
  onLogClaim: () => void;
}) {
  const pane = density === 'pane';

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-text-faint',
          pane ? 'px-4 py-6 text-role-caption' : 'py-2 text-role-caption',
        )}
      >
        <Loader2 className={cn('animate-spin', pane ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        {pane ? 'Loading claims…' : 'Loading…'}
      </div>
    );
  }

  if (claims.length === 0) {
    if (pane) {
      return (
        <div className="px-4 py-6 text-center text-role-caption text-text-faint">
          No warranty claims logged for this order yet.
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={onLogClaim} className="text-xs">
              + Log claim
            </Button>
          </div>
        </div>
      );
    }
    return (
      <Button variant="secondary" size="sm" onClick={onLogClaim} className="w-full text-xs">
        + Log claim
      </Button>
    );
  }

  return (
    <ul
      className={cn(
        'divide-y divide-border-hairline',
        pane ? undefined : 'overflow-hidden rounded-lg border border-border-soft',
      )}
    >
      {claims.map((claim) => (
        <li key={claim.id}>
          <Link
            href={`/support?mode=warranty&open=${claim.id}`}
            className={cn(
              'flex items-center justify-between gap-2 transition hover:bg-surface-hover',
              pane ? 'gap-3 px-4 py-2.5' : 'px-3 py-2',
            )}
          >
            {pane ? (
              <div className="min-w-0">
                <p className="truncate text-role-caption font-semibold text-text-default">
                  {claim.productTitle || claim.sku || claim.serialNumber || claim.claimNumber}
                </p>
                <p className="mt-0.5 truncate font-mono text-role-micro text-text-faint">
                  {claim.claimNumber}
                  {claim.serialNumber ? ` · ${claim.serialNumber}` : ''}
                </p>
              </div>
            ) : (
              <p className="min-w-0 truncate font-mono text-role-micro text-text-muted">
                {claim.claimNumber}
              </p>
            )}
            <div className={cn('flex shrink-0 items-center', pane ? 'gap-2' : 'gap-1.5')}>
              <WarrantyStatusBadge status={claim.status} />
              <WarrantyClockChip daysRemaining={claim.daysRemaining} basis={claim.clockBasis} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CoverageVerdict({
  density,
  query,
  coverage,
  isLoading,
  isFetching,
  onLogClaim,
}: {
  density: OrderWarrantyDensity;
  query: string;
  coverage: WarrantyCoverageResult | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
  onLogClaim: () => void;
}) {
  const pane = density === 'pane';

  if (!query) {
    if (pane) {
      return (
        <div className="rounded-lg border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-faint">
          This order has no order number, serial, or SKU to check coverage against.
        </div>
      );
    }
    return (
      <p className="text-role-caption text-text-faint">
        No order number, serial, or SKU to check coverage against.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-role-caption text-text-faint',
          pane && 'rounded-lg border border-border-soft bg-surface-card px-4 py-4',
        )}
      >
        <Loader2 className={cn('animate-spin', pane ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        {pane ? 'Checking warranty coverage…' : 'Checking coverage…'}
      </div>
    );
  }

  if (!coverage || !coverage.found) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2',
          pane && 'gap-3 rounded-lg border border-border-soft bg-surface-card px-4 py-4',
        )}
      >
        <p className="text-role-caption text-text-soft">
          {pane ? (
            <>
              No shipped coverage match for “
              <span className="font-medium text-text-muted">{query}</span>”.
            </>
          ) : (
            'No coverage match.'
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={onLogClaim} className="shrink-0 text-xs">
          {pane ? 'Log claim manually' : 'Log manually'}
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
        ? pane
          ? 'Last day of coverage'
          : 'Last day'
        : pane
          ? `${coverage.daysRemaining} day${coverage.daysRemaining === 1 ? '' : 's'} left`
          : `${coverage.daysRemaining}d left`
      : status === 'expired'
        ? pane
          ? `Expired ${Math.abs(coverage.daysRemaining ?? 0)} day${Math.abs(coverage.daysRemaining ?? 0) === 1 ? '' : 's'} ago`
          : `Expired ${Math.abs(coverage.daysRemaining ?? 0)}d ago`
        : pane
          ? 'No delivery date on file yet'
          : 'No delivery date';

  const expires = coverage.warrantyExpiresAt ? formatDateTimePST(coverage.warrantyExpiresAt) : null;

  return (
    <div className={cn('rounded-lg ring-1 ring-inset', pane ? 'p-4' : 'p-3', tone.ring, tone.bg)}>
      <div className={cn('flex items-start', pane ? 'gap-3' : 'gap-2.5')}>
        <span
          className={cn(
            'mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md bg-surface-card ring-1 ring-inset',
            pane ? 'h-9 w-9 rounded-lg' : 'h-7 w-7',
            tone.ring,
            tone.text,
          )}
        >
          <Icon className={pane ? 'h-5 w-5' : 'h-4 w-4'} />
        </span>
        <div className={cn('min-w-0 flex-1', !pane && 'stack-tight')}>
          <div className={cn('flex flex-wrap items-center', pane ? 'gap-2' : 'gap-1.5')}>
            <span className={cn('text-role-caption font-semibold', tone.text)}>{headline}</span>
            <span
              className={cn(
                'rounded-full font-semibold tabular-nums ring-1 ring-inset bg-surface-card',
                pane ? 'px-2 py-0.5 text-role-caption' : 'px-1.5 py-0.5 text-role-micro',
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
            {isFetching ? (
              <Loader2 className={cn('animate-spin text-text-faint', pane ? 'h-3.5 w-3.5' : 'h-3 w-3')} />
            ) : null}
          </div>
          {pane ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-role-caption sm:grid-cols-3">
              <CoverageFact label="Order #" value={coverage.sourceOrderId} mono />
              <CoverageFact label="Customer" value={coverage.customerName} />
              <CoverageFact
                label={provisional ? 'Est. delivered' : 'Delivered'}
                value={fmtStamp(coverage.deliveredAt ?? coverage.warrantyStartsAt)}
              />
              <CoverageFact label="Expires" value={fmtStamp(coverage.warrantyExpiresAt)} />
              <CoverageFact
                label="Term"
                value={coverage.warrantyDays ? `${coverage.warrantyDays} days` : null}
              />
              <CoverageFact
                label={coverage.serialNumber ? 'Serial' : 'SKU'}
                value={coverage.serialNumber || coverage.sku}
                mono
              />
            </dl>
          ) : expires ? (
            <p className="text-role-micro text-text-muted">Expires {expires}</p>
          ) : null}
          {coverage.existingClaim ? (
            pane ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/support?mode=warranty&open=${coverage.existingClaim.id}`}>
                  <Button variant="primary" size="sm" className="text-xs">
                    View claim {coverage.existingClaim.claimNumber}
                  </Button>
                </Link>
                <span className="text-role-caption text-text-faint">
                  Already logged · {WARRANTY_STATUS_LABEL[coverage.existingClaim.status]}
                </span>
              </div>
            ) : (
              <Link
                href={`/support?mode=warranty&open=${coverage.existingClaim.id}`}
                className="text-role-caption font-semibold text-blue-600 hover:text-blue-800"
              >
                View claim {coverage.existingClaim.claimNumber}
                <span className="ml-1 font-medium text-text-faint">
                  · {WARRANTY_STATUS_LABEL[coverage.existingClaim.status]}
                </span>
              </Link>
            )
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onLogClaim}
              className={cn('text-xs', pane ? 'mt-3' : 'w-fit')}
            >
              + Log claim
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoverageFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-role-micro font-medium uppercase tracking-wide text-text-faint">{label}</dt>
      <dd className={cn('truncate text-text-muted', mono && 'font-mono text-role-caption')}>
        {value || <span className="text-text-faint">—</span>}
      </dd>
    </div>
  );
}

function fmtStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return formatDateTimePST(value);
}
