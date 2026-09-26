'use client';

/** B3 — read-only Zoho-sync exception context for triage Unfound rows. */

import { useQuery } from '@tanstack/react-query';
import {
  indexReceivingExceptions,
  type ReceivingExceptionRow,
  type ReceivingExceptionContext,
} from '@/lib/receiving/triage-exception-context';

export function useTriageUnfoundExceptions(): Map<number, ReceivingExceptionContext> | undefined {
  const { data } = useQuery<Map<number, ReceivingExceptionContext>>({
    queryKey: ['receiving', 'triage', 'open-exceptions'] as const,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(
        '/api/tracking-exceptions?domain=receiving&status=open&limit=500',
        { cache: 'no-store' },
      );
      if (!res.ok) return new Map<number, ReceivingExceptionContext>();
      const json = (await res.json()) as { rows?: ReceivingExceptionRow[] };
      return indexReceivingExceptions(json.rows ?? []);
    },
  });
  return data;
}
