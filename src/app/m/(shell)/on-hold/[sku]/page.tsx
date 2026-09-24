'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSkuExceptionRecord } from '@/components/mobile/onhold/SkuExceptionScreen';
import { SkuExceptionInfoCard } from '@/components/mobile/onhold/SkuExceptionInfoCard';
import { skuExceptionHubRows } from '@/components/mobile/onhold/sku-exception-hub-rows';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { Camera, Link2, Share2 } from '@/components/Icons';
import {
  mobileSkuExceptionScreenHref,
  skuExceptionShareUrl,
} from '@/lib/inventory/sku-exception-links';
import { shareRecordLink } from '@/lib/share-link';

type HubVerb = 'share' | 'photo' | 'pair';

function daysOnHold(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'on hold today';
  return days === 1 ? '1 day on hold' : `${days} days on hold`;
}

/**
 * `/m/on-hold/[sku]` — the SKU exception HUB, on {@link DetailHubScreen}:
 * a read-only summary card on top that opens `/info`, then one door per exact
 * job (Photos · Locations · Pair), and the dock — Share · Take photo · Pair.
 * The share link is the plain app URL; a teammate opens this same hub.
 */
function SkuExceptionHubInner() {
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(params?.sku ?? '');
  const router = useRouter();

  const { item, state } = useSkuExceptionRecord(sku);

  return (
    <DetailHubScreen
      record={item}
      state={state}
      bar={{ title: sku, mono: true, meta: (r) => daysOnHold(r.createdAt) }}
      card={(r) => <SkuExceptionInfoCard item={r} />}
      rowsLabel="SKU exception screens"
      rows={skuExceptionHubRows}
      dock={(r) => (
        <DetailDock<HubVerb>
          label="SKU exception actions"
          verbs={[
            { id: 'share', label: 'Share', icon: <Share2 /> },
            { id: 'photo', label: 'Take photo', icon: <Camera /> },
            { id: 'pair', label: 'Pair', icon: <Link2 />, primary: true },
          ]}
          onVerb={(verb) => {
            if (verb === 'share') {
              void shareRecordLink(skuExceptionShareUrl(r.sku), `SKU exception — ${r.productTitle}`);
            } else if (verb === 'photo') {
              router.push(`${mobileSkuExceptionScreenHref(r.sku, 'photos')}?capture=1`);
            } else {
              router.push(mobileSkuExceptionScreenHref(r.sku, 'pair'));
            }
          }}
        />
      )}
    />
  );
}

export default function SkuExceptionHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <SkuExceptionHubInner />
    </Suspense>
  );
}
