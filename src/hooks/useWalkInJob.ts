'use client';

/**
 * URL ⇄ Walk-In job sub-mode on the Receiving Walk-In station (`/pickup`).
 * `?job=sales|pickup|repair` (default pickup).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_WALK_IN_JOB,
  parseWalkInJob,
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
