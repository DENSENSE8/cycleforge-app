'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchNavLocate } from '@/lib/nav/context/http-client';
import type { NavLocateScope } from '@/lib/nav/context/schema';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';

/** Shortest text worth locating — one or two characters match half the section. */
export const NAV_LOCATE_MIN_QUERY = 3;

/**
 * Typing pause before a text is located: a locate runs each bucket list's own
 * search (≈1–2s, the inbound Check may ask Zoho), so it waits for the words
 * to settle instead of firing per keystroke.
 */
const LOCATE_SETTLE_MS = 400;

function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * `GET /api/nav/locate` for the field's text or a pasted list. Keyed by
 * staff (the answer is permission-filtered); disabled while there is nothing
 * to locate. The previous answer stays painted while the next one loads, so
 * pills and rows never blink between keystrokes. `asked` is the settled text
 * the query is for — an answer acts on the field (↵ opens a match) only when
 * it is fresh (`!located.isPlaceholderData`) and `asked` is what is typed.
 */
export function useNavLocate(
  scope: NavLocateScope | undefined,
  input: { q: string } | { refs: readonly string[] },
) {
  const staffKey = useNavStaffKey();
  const isText = 'q' in input;
  const q = useSettled(isText ? input.q.trim() : '', isText ? LOCATE_SETTLE_MS : 0);
  const refs = isText ? [] : input.refs;
  const enabled = scope !== undefined && (isText ? q.length >= NAV_LOCATE_MIN_QUERY : refs.length > 0);
  const located = useQuery({
    queryKey: ['nav-locate', staffKey, scope, isText ? { q } : { refs: refs.join(',') }],
    queryFn: ({ signal }) => fetchNavLocate(scope as NavLocateScope, isText ? { q } : { refs }, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  return { located, asked: q };
}
