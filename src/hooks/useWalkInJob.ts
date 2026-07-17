'use client';

/**
 * URL ⇄ Walk-In job sub-mode on the Walk-In station (`/pickup`).
 * `?job=sales|pickup|repair` (default pickup).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import {
  DEFAULT_WALK_IN_JOB,
  parseWalkInJob,
  WALK_IN_JOB_PERMISSIONS,
  type WalkInJob,
} from '@/lib/walk-in/jobs';

const JOB_SCOPED_PARAMS = ['new', 'openRepair', 'search', 'tab'] as const;

export function useWalkInJob(): {
  job: WalkInJob;
  setJob: (next: WalkInJob) => void;
} {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const job = parseWalkInJob(searchParams.get('job'));

  const setJob = useCallback(
    (next: WalkInJob) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_WALK_IN_JOB) {
        params.delete('job');
      } else {
        params.set('job', next);
      }
      // Clear job-scoped params so each job opens clean.
      for (const key of JOB_SCOPED_PARAMS) {
        params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return { job, setJob };
}

/**
 * Per-job access on top of the route gate. The page is gated on `walk_in.view`;
 * a job may demand more (Repair → `repair.view`, see `WALK_IN_JOB_PERMISSIONS`).
 *
 * Stays permissive until `isLoaded`, so a permitted operator never sees a
 * denial flash on first paint.
 */
export function useWalkInJobAccess(job: WalkInJob): {
  allowed: boolean;
  requires: PermissionString | null;
} {
  const { has, isLoaded } = useAuth();
  const requires = WALK_IN_JOB_PERMISSIONS[job];
  return { allowed: !requires || !isLoaded || has(requires), requires };
}
