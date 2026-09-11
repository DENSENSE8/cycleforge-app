'use client';

/**
 * Per-id pick JobFace — `/m/id/pick/[orderId]`.
 *
 * List-claim (`source: 'claim'`) via GET `/api/orders/:id/pick-tasks`. Does not
 * open a picking session. Continue uses the house job `sessionPath` (`/m/pick/…`).
 */

import { useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { IdentificationJobFace } from '@/components/identification/IdentificationJobFace';
import {
  getIdentificationJob,
  identificationFromPick,
  type PickClaimJson,
} from '@/lib/identification';
import { setScanSubject } from '@/lib/stations/scan-subject-store';

export default function MobilePickIdentificationPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ? decodeURIComponent(params.orderId) : '';
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const pickJob = getIdentificationJob('pick');

  const query = useQuery({
    queryKey: ['identification', 'pick', orderId],
    enabled: Boolean(orderId) && isLoaded && Boolean(user?.organizationId),
    queryFn: async (): Promise<PickClaimJson> => {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/pick-tasks`);
      const json = (await res.json().catch(() => ({}))) as PickClaimJson;
      if (!res.ok) {
        return { ok: false, error: json.error || `pick-tasks ${res.status}` };
      }
      return { ok: true, ...json };
    },
  });

  const result = useMemo(() => {
    if (!user?.organizationId || !query.data) return null;
    return identificationFromPick({
      source: 'claim',
      organizationId: user.organizationId,
      clientEventId: `claim:pick:${orderId}`,
      json: query.data,
      requestedKey: orderId,
    });
  }, [orderId, query.data, user?.organizationId]);

  useEffect(() => {
    const id = result?.entity.id;
    if (!id || !Number.isFinite(Number(id)) || Number(id) <= 0) return;
    if (result.face.state === 'miss' || result.face.state === 'error') return;
    setScanSubject('order', id);
  }, [result]);

  const title =
    query.data?.orderLabel?.trim() ||
    query.data?.tasks?.[0]?.productTitle?.trim() ||
    orderId ||
    'Pick';

  const continueToSession = () => {
    if (!pickJob) return;
    router.push(pickJob.sessionPath(orderId));
  };

  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      <MobileDetailTopBar backHref="/m/pick" subtitle="Pick" title={title} mono />
      <main className="flex flex-1 flex-col items-stretch px-4 pt-4 pb-8">
        {!isLoaded || !user ? (
          <p className="text-role-caption text-text-muted">Loading…</p>
        ) : query.isError ? (
          <IdentificationJobFace
            result={identificationFromPick({
              source: 'claim',
              organizationId: user.organizationId,
              clientEventId: `claim:pick:${orderId}:error`,
              json: { ok: false, error: 'Could not load this order' },
              requestedKey: orderId,
            })}
          />
        ) : result ? (
          <IdentificationJobFace
            result={result}
            identity={{ title }}
            onContinue={continueToSession}
            continueLabel="Start pick"
          />
        ) : (
          <p className="text-role-caption text-text-muted">Loading…</p>
        )}
      </main>
    </div>
  );
}
