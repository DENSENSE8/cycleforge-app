'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';

/**
 * The SKU exception's record read, mapped onto the shared entity frame
 * ({@link DetailRecordFrame}): the SKU as the mono bar title, and the honest
 * non-record states — loading, already paired (a shared link opened after
 * someone paired it), and missing / failed. The hub mounts
 * `DetailHubScreen` with {@link useSkuExceptionRecord}; job screens (details,
 * photos, locations) mount this frame.
 */
export function useSkuExceptionRecord(sku: string) {
  const { data: item, mergedInto, isLoading, isError, refetch } = useProvisionalSku(sku);
  return {
    item: item ?? null,
    state: {
      loading: isLoading,
      error: isError ? 'Could not load this SKU exception.' : null,
      onRetry: () => void refetch(),
      notice: mergedInto ? (
        <>
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
        </>
      ) : null,
      missing: 'No SKU exception with this SKU.',
    },
  };
}

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
  const { item, state } = useSkuExceptionRecord(sku);
  return (
    <DetailRecordFrame record={item} state={state} bar={{ title: sku, mono: true, subtitle, backHref, meta, right }}>
      {children}
    </DetailRecordFrame>
  );
}
