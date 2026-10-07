'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { qk } from '@/queries/keys';
import { receivingHandle } from '@/lib/barcode-routing';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { lpnLocationMobileHref } from '@/lib/nav/route-tree';
import { fetchArrivalPackage } from '@/lib/receiving/arrival-client';
import { placeLpnLocation, unboxLocationTarget } from '@/lib/receiving/unbox-location-handoff';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';

/** How long "Placed on …" stays up before returning to where the request found the phone. */
const PLACED_RETURN_MS = 900;
/** Return when the request carried none — the phone's Unbox feed. */
const DEFAULT_RETURN = '/m/unbox';

/**
 * `/m/r/[id]/location` — the phone leg of the Unbox Location pill: the R-*
 * plate, the camera and a typed / wedge field. `?line=` places that receiving
 * line; without it the LPN itself is placed. Same writes as the desk pill.
 */
export function MobileV2LpnLocation({ receivingId }: { receivingId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = mobileJobReturn(searchParams?.get('back')) ?? DEFAULT_RETURN;
  const target = unboxLocationTarget({
    lineId: Number(searchParams?.get('line')),
    receivingId,
    cartonFallback: true,
  });
  const queryClient = useQueryClient();
  const { playScanFeedback } = useScanFeedback();
  const license = receivingHandle(receivingId);

  const query = useQuery({
    queryKey: qk.cartons.arrival(receivingId),
    queryFn: () => fetchArrivalPackage(receivingId),
    staleTime: 15_000,
  });
  const pkg = query.data;
  const item = target?.kind === 'line' ? pkg?.items.find((row) => row.lineId === target.lineId) ?? null : null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(() => router.replace(back), PLACED_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [placed, back, router]);

  const onDecode = useCallback(
    (raw: string) => {
      if (!target || busy || placed) return;
      setBusy(true);
      setError(null);
      void placeLpnLocation(target, raw, { surface: lpnLocationMobileHref(receivingId) })
        .then((result) => {
          if (result.kind === 'carton') queryClient.setQueryData(qk.cartons.arrival(receivingId), result.pkg);
          void queryClient.invalidateQueries({ queryKey: qk.cartons.unboxNext() });
          setPlaced(result.face);
          playScanFeedback('success');
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not place the LPN');
          playScanFeedback('reject');
        })
        .finally(() => setBusy(false));
    },
    [busy, placed, playScanFeedback, queryClient, receivingId, target],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-mode-panel" data-mobile-architecture="v2" data-testid="lpn-location-screen">
      <MobileV2DetailTopBar title={license} mono subtitle="Location" backHref={back} close />

      <div className="min-h-0 flex-1 divide-y divide-mode-rule overflow-y-auto">
        <section className="px-mode-page py-4">
          <p className="text-sm text-mode-muted">
            {target?.kind === 'line' ? 'Scan the location for this item.' : 'Scan the location this LPN goes to.'}
          </p>
          {item ? <p className="mt-2 whitespace-normal break-words text-sm text-mode-ink">{item.title}</p> : null}
          {target?.kind === 'carton' && pkg?.location ? (
            <p className="mt-2 text-sm text-mode-muted">
              On <span className="font-mono font-semibold text-mode-ink">{pkg.location.code}</span> — scan another location to move it.
            </p>
          ) : null}
        </section>

        {placed ? (
          <section className="px-mode-page py-8" aria-live="polite" data-testid="lpn-location-placed">
            <p className="text-role-eyebrow font-semibold uppercase tracking-wider text-mode-muted">Placed</p>
            <p className="mt-1 break-all text-role-title text-mode-ink">
              {license} on <span className="font-mono">{placed}</span>
            </p>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="px-mode-page py-3 text-sm font-semibold text-text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {placed ? null : (
        <div className="shrink-0 border-t border-mode-rule pb-safe">
          <MobileV2ScanInput
            onDecode={onDecode}
            placeholder="Scan or type a location"
            autoFocus
            prominentCamera
            cameraOnMount
            isResolving={busy}
          />
        </div>
      )}
    </div>
  );
}
