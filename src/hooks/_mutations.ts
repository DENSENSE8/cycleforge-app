'use client';

/** Shared server-mutation primitives for the God-component cleanup. */

import { useCallback } from 'react';
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { requestConfirm } from '@/design-system/components/confirm';

/** Error carrying the HTTP status so callers can branch on 401/403 vs 5xx. */
export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Resolve a fetch `Response` to JSON, throwing the server's `{ error }`
 * message (or `fallback`) as an `HttpError` when the response is not ok.
 * Tolerates empty bodies (e.g. 204 from DELETE endpoints).
 */
export async function jsonOrThrow<T = unknown>(
  res: Response,
  fallback = 'Request failed.',
): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new HttpError(String(body?.error || fallback), res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

interface ResourceMutationOptions<TData, TVars>
  extends Omit<UseMutationOptions<TData, Error, TVars>, 'mutationFn'> {
  /**
   * Query keys to invalidate on success. Each is passed to
   * `invalidateQueries({ queryKey })`, so a broad prefix (e.g. `qk.foo.all`)
   * matches every query beneath it. Prefer keys from the `qk` registry.
   */
  invalidates?: ReadonlyArray<readonly unknown[]>;
}

/** A `useMutation` that auto-invalidates the given query keys on success. */
export function useResourceMutation<TData = unknown, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: ResourceMutationOptions<TData, TVars> = {},
): UseMutationResult<TData, Error, TVars> {
  const queryClient = useQueryClient();
  const { invalidates, onSuccess, ...rest } = options;

  return useMutation<TData, Error, TVars>({
    ...rest,
    mutationFn,
    // Rest-forward so the wrapper stays agnostic to the exact callback arity
    // across TanStack Query minor versions.
    onSuccess: (...args) => {
      invalidates?.forEach((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      );
      onSuccess?.(...args);
    },
  });
}

/** Gate an async action behind the Kinetic Ledger AlertDialog confirm host. */
export function useConfirmedAction<Args extends unknown[]>(
  action: (...args: Args) => unknown | Promise<unknown>,
  message: string,
): (...args: Args) => Promise<boolean> {
  return useCallback(
    async (...args: Args): Promise<boolean> => {
      const ok = await requestConfirm({ description: message, tone: 'danger' });
      if (!ok) return false;
      await action(...args);
      return true;
    },
    [action, message],
  );
}

export {
  useOptimisticMutation,
  optimisticMutationOptions,
} from '@/lib/optimistic/useOptimisticMutation';
