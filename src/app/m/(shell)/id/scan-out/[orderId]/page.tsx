'use client';

/**
 * Per-id scan-out JobFace — `/m/id/scan-out/[orderId]`.
 *
 * GET wrap of `/api/shipped/scan-out?orderId=` (no SHIP_CONFIRM). Mapper is
 * {@link identificationFromScanOut} with `source: 'claim'`.
 */

import { useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { IdentificationJobFace } from '@/components/identification/IdentificationJobFace';
import {
  identificationFromScanOut,
  type ScanOutCartonJson,
} from '@/lib/identification';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

export default function MobileScanOutIdentificationPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ? decodeURIComponent(params.orderId) : '';
  const searchParams = useSearchParams();
  const { user, isLoaded } = useAuth();
  const clientEventIdRef = useRef(searchParams.get('scanEvent')?.trim() || safeRandomUUID());
  const mobileScanEventIdRaw = Number(searchParams.get('mse'));
  const mobileScanEventId =
    Number.isSafeInteger(mobileScanEventIdRaw) && mobileScanEventIdRaw > 0
      ? mobileScanEventIdRaw
      : null;
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState<ScanOutCartonJson | null>(null);

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
    const json = committed ?? query.data;
    if (!user?.organizationId || !json) return null;
    return identificationFromScanOut({
      source: committed ? 'scan' : 'claim',
      organizationId: user.organizationId,
      clientEventId: clientEventIdRef.current,
      json,
      requestedKey: orderId,
    });
  }, [committed, orderId, query.data, user?.organizationId]);
  const continueScanOut = async () => {
    const tracking = query.data?.tracking?.trim();
    if (!tracking || committing) return;
    setCommitting(true);
    try {
      const response = await fetch('/api/shipped/scan-out', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: tracking,
          orderId,
          source: 'phone',
          clientEventId: clientEventIdRef.current,
          mobileScanEventId,
          surface: `/m/id/scan-out/${encodeURIComponent(orderId)}`,
        }),
      });
      const body = await response.json().catch(() => null) as ScanOutCartonJson | null;
      if (!response.ok || !body?.ok) throw new Error(body?.message || `Scan out failed (${response.status})`);
      setCommitted(body);
      toast.success(body.duplicate ? 'Already scanned out' : 'Scanned out');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not scan out this order');
    } finally {
      setCommitting(false);
    }
  };

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
      <div className="flex flex-1 flex-col items-stretch px-4 pt-4 pb-8">
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
          <IdentificationJobFace
            result={result}
            carton={committed ?? query.data}
            onContinue={committing || committed ? undefined : () => { void continueScanOut(); }}
            continueLabel={committing ? 'Scanning out…' : 'Scan out'}
          />
        ) : (
          <p className="text-role-caption text-text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
