'use client';

/** The write primitive. */

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  beginOptimisticUpdate,
  mutationErrorMessage,
  restoreSnapshots,
  type CacheSnapshot,
  type OptimisticCache,
} from './apply-optimistic-cache';

export type { OptimisticCache };

export type OptimisticMutationConfig<TData, TVars> = {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** At least one cache. An empty list is not an optimistic write. */
  caches: readonly [OptimisticCache<TVars>, ...OptimisticCache<TVars>[]];
  /**
   * Bottom-right error copy. Defaults to the thrown Error message.
   * Pass a string to override, or a fn to map HttpError / envelope.
   */
  errorToast?: string | ((err: Error) => string);
  /** Quiet success whisper. Omit to stay silent on success (the paint is the feedback). */
  successToast?: string;
  /** Extra keys to refetch after settle, besides the patched ones. */
  invalidates?: ReadonlyArray<readonly unknown[]>;
} & Omit<
  UseMutationOptions<TData, Error, TVars, CacheSnapshot[]>,
  'mutationFn' | 'onMutate'
>;

function errorCopy(err: Error, spec: OptimisticMutationConfig<unknown, unknown>['errorToast']): string {
  if (typeof spec === 'function') return spec(err);
  if (typeof spec === 'string' && spec.trim()) return spec;
  return mutationErrorMessage(err);
}

/** Testable option builder — the hook is this plus `useQueryClient`. */
export function optimisticMutationOptions<TData, TVars>(
  client: QueryClient,
  config: OptimisticMutationConfig<TData, TVars>,
): UseMutationOptions<TData, Error, TVars, CacheSnapshot[]> {
  const { mutationFn, caches, errorToast, successToast, invalidates, onError, onSuccess, onSettled, ...rest } =
    config;

  return {
    ...rest,
    mutationFn,
    onMutate: (vars) => beginOptimisticUpdate(client, caches, vars),
    // `mutationCtx` is react-query v5's trailing MutationFunctionContext. This
    // wrapper owns none of it — it is forwarded untouched so a caller's own
    // callback sees exactly what it would have seen without the wrapper.
    onError: (err, vars, ctx, mutationCtx) => {
      if (ctx) restoreSnapshots(client, ctx);
      toast.error(errorCopy(err, errorToast));
      onError?.(err, vars, ctx, mutationCtx);
    },
    onSuccess: (data, vars, ctx, mutationCtx) => {
      if (successToast) toast.success(successToast);
      onSuccess?.(data, vars, ctx, mutationCtx);
    },
    onSettled: (data, err, vars, ctx, mutationCtx) => {
      for (const cache of caches) {
        void client.invalidateQueries({ queryKey: cache.queryKey });
      }
      invalidates?.forEach((queryKey) => {
        void client.invalidateQueries({ queryKey });
      });
      onSettled?.(data, err, vars, ctx, mutationCtx);
    },
  };
}

export function useOptimisticMutation<TData = unknown, TVars = void>(
  config: OptimisticMutationConfig<TData, TVars>,
): UseMutationResult<TData, Error, TVars, CacheSnapshot[]> {
  const client = useQueryClient();
  return useMutation(optimisticMutationOptions(client, config));
}
