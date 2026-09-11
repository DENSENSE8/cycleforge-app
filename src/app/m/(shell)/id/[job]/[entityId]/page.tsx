'use client';

/**
 * Generic tenant JobFace — `/m/id/[job]/[entityId]`.
 *
 * House jobs (`scan-out`, `pick`) keep their more-specific routes. This page
 * loads GET `/api/identification/jobs/[jobId]` and mounts IdentificationJobFace.
 * Unknown published id → miss. No per-tenant `*-face.ts`.
 */

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { IdentificationJobFace } from '@/components/identification/IdentificationJobFace';
import {
  fillIdentificationPath,
  identificationFromPublishedClaim,
  type IdentificationJobOrigin,
  type JobFaceMutate,
} from '@/lib/identification';

type JobPayload = {
  ok: boolean;
  job?: {
    id: string;
    origin: IdentificationJobOrigin;
    entityKind: 'order';
    mutate: JobFaceMutate;
    claimPath: string;
    sessionPath: string;
  };
  error?: string;
};

export default function MobileTenantIdentificationPage() {
  const params = useParams<{ job: string; entityId: string }>();
  const jobId = params?.job ? decodeURIComponent(params.job) : '';
  const entityId = params?.entityId ? decodeURIComponent(params.entityId) : '';
  const router = useRouter();
  const { user, isLoaded } = useAuth();

  const query = useQuery({
    queryKey: ['identification', 'job', jobId],
    enabled: Boolean(jobId) && isLoaded && Boolean(user?.organizationId),
    queryFn: async (): Promise<JobPayload> => {
      const res = await fetch(`/api/identification/jobs/${encodeURIComponent(jobId)}`);
      const json = (await res.json().catch(() => ({}))) as JobPayload;
      if (res.status === 404 || !json.ok || !json.job) {
        return { ok: false, error: json.error || 'not found' };
      }
      return json;
    },
  });

  useEffect(() => {
    const job = query.data?.job;
    if (!job || job.origin !== 'house' || !entityId) return;
    router.replace(fillIdentificationPath(job.claimPath, entityId));
  }, [entityId, query.data?.job, router]);

  const result = useMemo(() => {
    if (!user?.organizationId) return null;
    if (query.data == null) return null;
    if (!query.data.ok || !query.data.job) {
      return identificationFromPublishedClaim({
        organizationId: user.organizationId,
        clientEventId: `claim:${jobId}:${entityId}:miss`,
        record: {
          id: jobId || 'unknown',
          origin: 'tenant',
          entityKind: 'order',
          mutate: null,
          claimPath: () => '/m/scan',
          sessionPath: () => '/m/scan',
        },
        entityId: '',
      });
    }
    const job = query.data.job;
    if (job.origin === 'house') return null;
    return identificationFromPublishedClaim({
      organizationId: user.organizationId,
      clientEventId: `claim:${job.id}:${entityId}`,
      record: {
        id: job.id,
        origin: job.origin,
        entityKind: job.entityKind,
        mutate: job.mutate,
        claimPath: (id) => fillIdentificationPath(job.claimPath, id),
        sessionPath: (id) => fillIdentificationPath(job.sessionPath, id),
      },
      entityId,
    });
  }, [entityId, jobId, query.data, user?.organizationId]);

  const continueToSession = () => {
    const job = query.data?.job;
    if (!job) return;
    router.push(fillIdentificationPath(job.sessionPath, entityId));
  };

  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      <MobileDetailTopBar backHref="/m/scan" subtitle="Identify" title={jobId || 'Identify'} mono />
      <main className="flex flex-1 flex-col items-stretch px-4 pt-4 pb-8">
        {!isLoaded || !user ? (
          <p className="text-role-caption text-text-muted">Loading…</p>
        ) : result ? (
          <IdentificationJobFace
            result={result}
            identity={{ title: entityId || jobId }}
            onContinue={continueToSession}
            continueLabel="Continue"
          />
        ) : (
          <p className="text-role-caption text-text-muted">Loading…</p>
        )}
      </main>
    </div>
  );
}
