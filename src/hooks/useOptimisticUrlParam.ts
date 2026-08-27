'use client';

/**
 * Paint-pending URL param — see `@/lib/routing/optimistic-url-param`.
 *
 * Inject the surface's existing `replaceParams` + a `write` that mutates the
 * params bag for `next`. Domain parsing stays in the caller.
 *
 * Optional `shareKey`: when sidebar and main shell are separate React trees
 * (each calling this hook), pass the same key so one pending paints both.
 */

import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  resolveOptimisticParam,
  resolveOptimisticParams,
  shouldClearOptimisticParam,
  shouldClearOptimisticParams,
} from '@/lib/routing/optimistic-url-param';

type UseOptimisticUrlParamOpts<T> = {
  /** Already-parsed value from `useSearchParams`. */
  urlValue: T;
  equals?: (a: T, b: T) => boolean;
  /** Surface replace — owns path, isolation parse, router.replace. */
  replace: (mutate: (params: URLSearchParams) => void) => void;
  /** Apply `next` onto the params bag the replace callback provides. */
  write: (params: URLSearchParams, next: T) => void;
  /**
   * Cross-tree pending channel. Same key → one pending shared by every
   * hook instance (e.g. inventory sidebar + InventoryShell).
   */
  shareKey?: string;
};

type Channel = {
  pending: unknown;
  listeners: Set<() => void>;
};

const channels = new Map<string, Channel>();

function getChannel(key: string): Channel {
  let ch = channels.get(key);
  if (!ch) {
    ch = { pending: undefined, listeners: new Set() };
    channels.set(key, ch);
  }
  return ch;
}

function subscribeChannel(key: string, onStoreChange: () => void): () => void {
  const ch = getChannel(key);
  ch.listeners.add(onStoreChange);
  return () => {
    ch.listeners.delete(onStoreChange);
  };
}

function getChannelPending<T>(key: string): T | undefined {
  return getChannel(key).pending as T | undefined;
}

function setChannelPending<T>(key: string, next: T | undefined): void {
  const ch = getChannel(key);
  ch.pending = next;
  for (const listener of ch.listeners) listener();
}

export function useOptimisticUrlParam<T>({
  urlValue,
  equals = Object.is,
  replace,
  write,
  shareKey,
}: UseOptimisticUrlParamOpts<T>): {
  value: T;
  setValue: (next: T) => void;
  /** Paint without replace — for multi-field replaces that also clear this key. */
  paint: (next: T) => void;
} {
  const [localPending, setLocalPending] = useState<T | undefined>(undefined);

  const sharedPending = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!shareKey) return () => {};
        return subscribeChannel(shareKey, onStoreChange);
      },
      [shareKey],
    ),
    useCallback(
      () => (shareKey ? getChannelPending<T>(shareKey) : undefined),
      [shareKey],
    ),
    () => undefined,
  );

  const pending = shareKey ? sharedPending : localPending;
  const setPending = useCallback(
    (next: T | undefined) => {
      if (shareKey) setChannelPending(shareKey, next);
      else setLocalPending(next);
    },
    [shareKey],
  );

  useEffect(() => {
    if (shouldClearOptimisticParam(urlValue, pending, equals)) {
      setPending(undefined);
    }
  }, [urlValue, pending, equals, setPending]);

  const value = resolveOptimisticParam(urlValue, pending);

  const paint = useCallback(
    (next: T) => {
      setPending(next);
    },
    [setPending],
  );

  const setValue = useCallback(
    (next: T) => {
      setPending(next);
      startTransition(() => {
        replace((params) => {
          write(params, next);
        });
      });
    },
    [replace, write, setPending],
  );

  return { value, setValue, paint };
}

type UseOptimisticUrlParamsOpts<T extends Record<string, unknown>> = {
  /** Already-parsed compound values from `useSearchParams`. */
  urlValues: T;
  /** Full-record equals; when omitted, clear is per-key `Object.is` on pending keys. */
  equals?: (a: T, b: T) => boolean;
  replace: (mutate: (params: URLSearchParams) => void) => void;
  write: (params: URLSearchParams, next: T) => void;
};

/**
 * Compound paint-pending — multi-key opens (task ↔ watch, Review overlays)
 * share one pending record. `paint` merges a patch; `setValue` writes the
 * full next + soft-replace. No `shareKey` (cross-tree compounds use Context later).
 */
export function useOptimisticUrlParams<T extends Record<string, unknown>>({
  urlValues,
  equals,
  replace,
  write,
}: UseOptimisticUrlParamsOpts<T>): {
  value: T;
  setValue: (next: T) => void;
  /** Merge patch into pending without replace (multi-field / mutual exclusion). */
  paint: (patch: Partial<T>) => void;
} {
  const [pending, setPending] = useState<Partial<T> | undefined>(undefined);

  useEffect(() => {
    if (pending === undefined) return;
    if (equals) {
      const merged = resolveOptimisticParams(urlValues, pending);
      if (equals(urlValues, merged)) setPending(undefined);
      return;
    }
    if (shouldClearOptimisticParams(urlValues, pending)) {
      setPending(undefined);
    }
  }, [urlValues, pending, equals]);

  const value = resolveOptimisticParams(urlValues, pending);

  const paint = useCallback((patch: Partial<T>) => {
    setPending((prev) => ({ ...(prev ?? {}), ...patch }));
  }, []);

  const setValue = useCallback(
    (next: T) => {
      setPending(next);
      startTransition(() => {
        replace((params) => {
          write(params, next);
        });
      });
    },
    [replace, write],
  );

  return { value, setValue, paint };
}
