'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';

/**
 * The frame every SKU exception screen shares (hub, details, photos,
 * locations): triage mode on the panel ground, the SKU as the mono bar title,
 * and the three honest non-record states — loading, already paired (a shared
 * link opened after someone paired it), and missing / failed. `children`
 * renders only with a live record, so a screen never guards for it.
 */
export function SkuExceptionScreen({
  sku,
  subtitle,
  backHref,
  meta,
  right,
  children,
}: {
  sku: string;
  subtitle?: string;
  backHref?: string;
  meta?: (item: ProvisionalSkuDetail) => ReactNode;
  right?: (item: ProvisionalSkuDetail) => ReactNode;
  children: (item: ProvisionalSkuDetail) => ReactNode;
}) {
  const { data: item, mergedInto, isLoading, isError, refetch } = useProvisionalSku(sku);

  return (
    // Deciding what an unknown box is — and recording it — is a triage job.
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        title={sku}
        mono
        subtitle={subtitle}
        backHref={backHref}
        meta={item && meta ? meta(item) : undefined}
        right={item && right ? right(item) : undefined}
      />
      {item ? (
        children(item)
      ) : (
        <div className="flex-1 space-y-4 px-mode-page py-mode-page">
          {isLoading ? (
            <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
          ) : mergedInto ? (
            <div className="rounded-mode border border-mode-edge bg-mode-panel p-mode-page text-mode-body text-mode-ink">
              <p>
                Already paired to <span className="font-mono font-semibold">{mergedInto}</span> — its stock,
                history and photos moved there.
              </p>
              <Link
                href="/m/on-hold"
                className="mt-2 inline-flex min-h-mode-hit items-center text-role-caption font-semibold underline"
              >
                Back to SKU exceptions
              </Link>
            </div>
          ) : (
            <div className="space-y-2 rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
              <p>{isError ? 'Could not load this SKU exception.' : 'No SKU exception with this SKU.'}</p>
              {isError ? (
                <Button variant="secondary" size="lg" className="rounded-mode" onClick={() => void refetch()}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ModeRegion>
  );
}
