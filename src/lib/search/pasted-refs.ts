/**
 * `/search?refs=` — the global pasted list. Same splitter as the sidebar
 * paste (`parseRefList`). The route spec owns `refs`. Commas in the href stay
 * commas; each identifier is still encoded.
 */

import { OUTBOUND_LOCATE_REFS_PARAM } from '@/lib/nav/locate/outbound-params';
import { parseRefList } from '@/lib/receiving/reconcile';

export const SEARCH_REFS_PARAM = OUTBOUND_LOCATE_REFS_PARAM;

/** Two or more identifiers, or null (a single line stays ordinary search). */
export function pastedRefList(text: string): string[] | null {
  const refs = parseRefList(text).refs;
  return refs.length >= 2 ? refs : null;
}

/** Comma-joined, each ref encoded. Commas stay commas — `URLSearchParams` would turn each into `%2C`. */
export function compactRefParam(refs: readonly string[]): string {
  return refs.map((ref) => encodeURIComponent(ref)).join(',');
}

export function pastedRefsHref(refs: readonly string[]): string {
  return `/search?${SEARCH_REFS_PARAM}=${compactRefParam(refs)}`;
}
