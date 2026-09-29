/**
 * Exceptions hub facet counts. A context's `total` is the hub list's total
 * for that view — `countExceptions`, the SAME source `count` / `list` the
 * `GET /api/exceptions` rows and `counts` come from — over the kinds the
 * caller may see:
 *
 * - `exceptions.<kind>`: that kind (`/exceptions?kind=<kind>`);
 * - `exceptions.<domain>`: that domain's kinds (Fulfillment · Inventory · Receiving);
 * - `exceptions` (the bare page id): every visible kind (bare `/exceptions`, no active view);
 * - `outbound.exceptions`: the Fulfillment kinds — FBM › Exceptions renders
 *   the hub list locked to `domain=fulfillment`.
 *
 * No option groups: the hub's kind / domain rows ARE its filters. `?q=`
 * narrows like the list's search.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import type { NavFacetContext } from '@/lib/nav/facets/contexts';
import type { ExceptionCaller } from '@/lib/exceptions/hub';
import { exceptionKindsOf, parseExceptionDomain, parseExceptionKind, type ExceptionKind } from '@/lib/exceptions/types';

export type ExceptionCountReader = (
  caller: ExceptionCaller,
  kinds: readonly ExceptionKind[] | null,
  q: string | null,
) => Promise<Partial<Record<ExceptionKind, number>>>;

export type ExceptionFacetContext = Extract<NavFacetContext, 'exceptions' | `exceptions.${string}` | 'outbound.exceptions'>;

export function isExceptionFacetContext(context: NavFacetContext): context is ExceptionFacetContext {
  return context === 'exceptions' || context === 'outbound.exceptions' || context.startsWith('exceptions.');
}

/** The kinds a context totals; null = every kind the caller may see. */
export function exceptionFacetKinds(context: ExceptionFacetContext): readonly ExceptionKind[] | null {
  if (context === 'outbound.exceptions') return exceptionKindsOf('fulfillment');
  if (context === 'exceptions') return null;
  const id = context.slice('exceptions.'.length);
  const domain = parseExceptionDomain(id);
  if (domain) return exceptionKindsOf(domain);
  const kind = parseExceptionKind(id);
  if (!kind) throw new Error(`no exceptions kind for facet context ${context}`);
  return [kind];
}

export async function exceptionFacets(
  context: ExceptionFacetContext,
  caller: ExceptionCaller,
  params: Pick<URLSearchParams, 'get'>,
  readCounts: ExceptionCountReader,
): Promise<NavFacetsResponse> {
  const q = String(params.get('q') ?? '').trim() || null;
  const counts = await readCounts(caller, exceptionFacetKinds(context), q);
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return { context, total, groups: [] };
}
