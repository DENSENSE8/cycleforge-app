'use client';

/**
 * Per-id scan-out JobFace — `/m/id/scan-out/[orderId]`.
 *
 * GET wrap of `/api/shipped/scan-out?orderId=` (no SHIP_CONFIRM). Mapper is
 * {@link identificationFromScanOut} with `source: 'claim'`.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { IdentificationJobFace } from '@/components/identification/IdentificationJobFace';
import {
  identificationFromScanOut,
  type ScanOutCartonJson,
} from '@/lib/identification';

export default function MobileScanOutIdentificationPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ? decodeURIComponent(params.orderId) : '';
  const { user, isLoaded } = useAuth();

  const query = useQuery({
    queryKey: ['identification', 'scan-out', orderId],
    enabled: Boolean(orderId) && isLoaded && Boolean(user?.organizationId),
    queryFn: async (): Promise<ScanOutCartonJson> => {
      const res = await fetch(
        `/api/shipped/scan-out?orderId=${encodeURIComponent(orderId)}`,
      );
      if (!res.ok) throw new Error(`scan-out face failed (${res.status})`);
      return res.json();
    },
  });

  const result = useMemo(() => {
    if (!user?.organizationId || !query.data) return null;
    return identificationFromScanOut({
      source: 'claim',
      organizationId: user.organizationId,
      clientEventId: `claim:scan_out:${orderId}`,
      json: query.data,
      requestedKey: orderId,
    });
  }, [orderId, query.data, user?.organizationId]);

  const title =
    query.data?.productTitle?.trim() ||
    query.data?.orderId?.trim() ||
    orderId ||
    'Scan out';

  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      <MobileDetailTopBar
        backHref="/m/scan"
        subtitle="Scan out"
        title={title}
        mono
      />
      <main className="flex flex-1 flex-col items-stretch px-4 pt-4 pb-8">
        {!isLoaded || !user ? (
          <p className="text-role-caption text-text-muted">Loading…</p>
        ) : query.isError ? (
          <IdentificationJobFace
            result={identificationFromScanOut({
              source: 'claim',
              organizationId: user.organizationId,
              clientEventId: `claim:scan_out:${orderId}:error`,
              json: { ok: false, matched: false, message: 'Could not load this order' },
              requestedKey: orderId,
            })}
          />
        ) : result ? (
          <IdentificationJobFace result={result} carton={query.data} />
        ) : (
          <p className="text-role-caption text-text-muted">Loading…</p>
        )}
      </main>
    </div>
  );
}
