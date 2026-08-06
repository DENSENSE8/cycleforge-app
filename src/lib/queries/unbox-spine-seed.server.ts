/**
 * Server seed for Unbox History spine — dehydrates the same key
 * `useReceivingLinesQuery` mounts with on bare `/unbox` (History · spine).
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { RECEIVING_MODES } from '@/lib/receiving/receiving-modes';
import { DEFAULT_UNBOX_CONTEXT } from '@/lib/receiving/default-unbox-context';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';

interface UnboxSpineSeed {
  state: DehydratedState;
}

/**
 * Prefetch History spine (`?phase=spine`). Soft-fail — client still fetches.
 */
export async function seedUnboxSpine(
  ctx = DEFAULT_UNBOX_CONTEXT,
): Promise<UnboxSpineSeed> {
  const queryClient = new QueryClient();
  const mode = RECEIVING_MODES.history;
  const params = mode.buildParams(ctx);
  params.delete('include');
  params.set('phase', 'spine');
  const limit = Number(params.get('limit'));
  if (Number.isFinite(limit) && limit > 150) {
    params.set('limit', '150');
  }

  const spineKey = [...mode.queryKey(ctx), 'spine'] as const;

  try {
    const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as {
        success: boolean;
        receiving_lines: unknown[];
        total: number;
        limit: number;
        offset: number;
      };
      queryClient.setQueryData(spineKey, data);
    }
  } catch (error) {
    console.error('seedUnboxSpine failed; client will fetch', error);
  }

  return { state: dehydrate(queryClient) };
}
