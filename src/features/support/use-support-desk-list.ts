'use client';

/**
 * The /support list read for the desk: the URL's list params (view, the
 * sidebar's facets, sort, group), the status chips' canonical list and the
 * debounced Find → `useSupportList`. `item` is not a list param — opening a
 * record never refetches the list.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SupportLocalStatus } from '@/lib/support/conversation/model';
import { useSupportList } from '@/lib/support/list/use-support-list';
import { SUPPORT_STATUS_PARAM } from './support-face';

/** The list's own params, in a fixed order — the query key. */
const LIST_PARAMS = ['view', 'platform', 'account', 'assignee', 'sort', 'group'] as const;

/** Find is debounced before it reaches the server. */
const FIND_DEBOUNCE_MS = 250;

export function useSupportDeskList(statusFilter: ReadonlySet<SupportLocalStatus>) {
  const searchParams = useSearchParams();
  const find = (searchParams.get('q') ?? '').trim();
  const [debounced, setDebounced] = useState(find);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(find), FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [find]);

  const listSearch = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of LIST_PARAMS) {
      const value = searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }
    // The chips' own list, in the vocabulary's order — exactly what the face lit, so the server cuts what the chips say.
    if (statusFilter.size > 0) params.set(SUPPORT_STATUS_PARAM, [...statusFilter].join(','));
    if (debounced) params.set('q', debounced);
    return params.toString();
  }, [searchParams, statusFilter, debounced]);

  const list = useSupportList(listSearch);
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  return { debounced, list, rows, statusCounts: list.data?.statusCounts };
}
