import { queryOptions } from '@tanstack/react-query';
import type { QcQueuePayload } from './qc-queue-order';

/** Every read of the QC queue shares this key: a verdict or a bin pair invalidates it. */
export const QC_QUEUE_QUERY_KEY = ['qc.queue'] as const;

/** `/m/qc`'s read — the queue, tiered and sorted server-side (`GET /api/qc/queue`). */
export function qcQueueQuery() {
  return queryOptions<QcQueuePayload>({
    queryKey: QC_QUEUE_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/qc/queue', { cache: 'no-store', credentials: 'include' });
      const body = (await res.json().catch(() => null)) as (QcQueuePayload & { error?: string }) | null;
      if (!res.ok || !body || !Array.isArray(body.units)) {
        throw new Error(body?.error || `Couldn't load the QC queue (${res.status})`);
      }
      return body;
    },
  });
}
