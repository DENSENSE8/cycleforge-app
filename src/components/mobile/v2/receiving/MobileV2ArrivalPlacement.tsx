'use client';

/**
 * `/m/r/[id]/place` — the pairing step after the door scan: the package, its
 * urgency (Urgent / Not urgent, one tap writes), then a scan of ANY location
 * label pairs the package to it. "Placed on <code> · Urgent" stays up briefly,
 * then the operator is back in the scan loop for the next package.
 *
 * Any active location is accepted (operator 2026-10-04); a location carries
 * no urgency (operator 2026-10-05). Reads and writes: `GET|POST /api/receiving/[id]/arrival`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { IdentifierToggle } from '@/components/ui/IdentifierToggle';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { qk } from '@/queries/keys';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { fetchArrivalPackage, postArrivalAction } from '@/lib/receiving/arrival-client';
import type { ArrivalPackage } from '@/lib/receiving/arrival-contract';
import { cn } from '@/utils/_cn';

/** How long "Placed on …" stays up before the scan loop takes over again. */
const PLACED_RETURN_MS = 900;

type UrgencyChoice = 'urgent' | 'not_urgent';

function PackageCard({ pkg }: { pkg: ArrivalPackage }) {
  const facts = [pkg.platformLabel, pkg.orderNumber ? `Order ${pkg.orderNumber}` : null, pkg.vendor].filter(Boolean);
  return (
    <section className="px-mode-page py-4" data-testid="arrival-package-card">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all font-mono text-role-title text-mode-ink">{pkg.tracking ?? `Package ${pkg.receivingId}`}</p>
        <span
          className={cn(
            'shrink-0 rounded-mode-pill px-2.5 py-1 text-role-caption font-semibold',
            pkg.found ? 'bg-surface-sunken text-mode-ink' : 'bg-amber-100 text-amber-800',
          )}
        >
          {pkg.found ? 'Found' : 'Unfound'}
        </span>
      </div>
      {facts.length > 0 ? <p className="mt-1 text-sm text-mode-muted">{facts.join(' · ')}</p> : null}
      {pkg.items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {pkg.items.map((item) => (
            <li key={item.lineId} className="whitespace-normal break-words text-sm text-mode-ink">
              {item.quantity != null && item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.title}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function MobileV2ArrivalPlacement({ receivingId }: { receivingId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = mobileJobReturn(searchParams?.get('back')) ?? '/m/scan';
  const queryClient = useQueryClient();
  const { playScanFeedback } = useScanFeedback();

  const query = useQuery({
    queryKey: qk.cartons.arrival(receivingId),
    queryFn: () => fetchArrivalPackage(receivingId),
    staleTime: 15_000,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<ArrivalPackage | null>(null);

  useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(() => router.replace(back), PLACED_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [placed, back, router]);

  const settle = useCallback(
    (pkg: ArrivalPackage) => {
      queryClient.setQueryData(qk.cartons.arrival(receivingId), pkg);
      void queryClient.invalidateQueries({ queryKey: qk.cartons.unboxNext() });
    },
    [queryClient, receivingId],
  );

  const onUrgency = useCallback(
    (choice: UrgencyChoice) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      void postArrivalAction(receivingId, { action: 'urgency', urgent: choice === 'urgent', clientEventId: safeRandomUUID() })
        .then(settle)
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not save urgency');
          playScanFeedback('reject');
        })
        .finally(() => setBusy(false));
    },
    [busy, receivingId, settle, playScanFeedback],
  );

  const onDecode = useCallback(
    (raw: string) => {
      if (busy || placed) return;
      setBusy(true);
      setError(null);
      void postArrivalAction(receivingId, {
        action: 'place',
        scanned: raw,
        clientEventId: safeRandomUUID(),
        surface: `/m/r/${receivingId}/place`,
      })
        .then((pkg) => {
          settle(pkg);
          setPlaced(pkg);
          playScanFeedback('success');
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not place the package');
          playScanFeedback('reject');
        })
        .finally(() => setBusy(false));
    },
    [busy, placed, receivingId, settle, playScanFeedback],
  );

  const pkg = query.data;

  return (
    <div className="flex h-full min-h-0 flex-col bg-mode-panel" data-mobile-architecture="v2">
      <MobileV2DetailTopBar title={`Package ${receivingId}`} mono subtitle="Pair to a location" backHref={back} close />

      <div className="min-h-0 flex-1 divide-y divide-mode-rule overflow-y-auto">
        {query.isPending ? (
          <p className="px-mode-page py-10 text-center text-sm font-semibold text-mode-muted">Loading the package…</p>
        ) : query.isError || !pkg ? (
          <div className="flex flex-col items-center gap-3 px-mode-page py-10 text-center">
            <p className="text-sm font-semibold text-text-danger">
              {query.error instanceof Error ? query.error.message : 'Could not load the package'}
            </p>
            <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : placed ? (
          <section className="px-mode-page py-8" aria-live="polite" data-testid="arrival-placed">
            <p className="text-role-eyebrow font-semibold uppercase tracking-wider text-mode-muted">Placed</p>
            <p className="mt-1 break-all text-role-title text-mode-ink">
              Placed on <span className="font-mono">{placed.location?.code ?? '—'}</span> · {placed.urgency.urgent ? 'Urgent' : 'Not urgent'}
            </p>
          </section>
        ) : (
          <>
            <PackageCard pkg={pkg} />
            <section className="px-mode-page py-4">
              <IdentifierToggle<UrgencyChoice>
                value={pkg.urgency.urgent ? 'urgent' : 'not_urgent'}
                onChange={onUrgency}
                ariaLabel="Urgency"
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'not_urgent', label: 'Not urgent' },
                ]}
              />
              <p className="mt-2 text-sm text-mode-muted">{pkg.urgency.reason}</p>
            </section>
            {pkg.location ? (
              <section className="px-mode-page py-4 text-sm text-mode-muted">
                <p>
                  On <span className="font-mono font-semibold text-mode-ink">{pkg.location.code}</span> — scan another location to move it.
                </p>
              </section>
            ) : null}
            {error ? (
              <p role="alert" className="px-mode-page py-3 text-sm font-semibold text-text-danger">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>

      {pkg && !placed ? (
        <div className="shrink-0 border-t border-mode-rule pb-safe">
          <MobileV2ScanInput
            onDecode={onDecode}
            placeholder="Scan any location label"
            autoFocus
            prominentCamera
            isResolving={busy}
          />
        </div>
      ) : null}
    </div>
  );
}
