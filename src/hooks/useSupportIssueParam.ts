'use client';

/**
 * Support Issues `?issueId=` paint-pending — workspace + queue (incl. sidebar)
 * share one pending via `shareKey`.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';

const SUPPORT_PATH = '/support';

function parseIssueId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useSupportIssueParam(): {
  issueId: number | null;
  setIssueId: (next: number | null) => void;
  paintIssue: (next: number | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlIssue = useMemo(
    () => parseIssueId(searchParams.get('issueId')),
    [searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'issues');
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_PATH}?${qs}` : `${SUPPORT_PATH}?mode=issues`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('issueId', String(next));
    else params.delete('issueId');
  }, []);

  const { value, setValue, paint } = useOptimisticUrlParam<number | null>({
    urlValue: urlIssue,
    replace,
    write,
    shareKey: 'support:issueId',
  });

  return { issueId: value, setIssueId: setValue, paintIssue: paint };
}
