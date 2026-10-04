/**
 * Who may see each Exceptions kind — the SAME permission its source list is
 * served under today (`/api/orders/exceptions`, `/api/v1/label-ingestions`,
 * `/api/orders-exceptions/unmatched`, `/api/inventory/alerts`,
 * `/api/tracking-exceptions`, `/api/receiving-lines`).
 * Pure and client-safe: the hub route, the nav facets and the sidebar gate all
 * read this one map, so a hidden kind is absent from rows, counts and nav alike.
 */

import type { PermissionString } from '@/lib/auth/permissions-shared';
import { EXCEPTION_KINDS, EXCEPTION_KIND_SPEC, type ExceptionDomain, type ExceptionKind } from './types';

export const EXCEPTION_KIND_PERMISSION: Readonly<Record<ExceptionKind, PermissionString>> = {
  fbm: 'orders.view',
  labels: 'packing.review',
  paperwork: 'orders.view',
  unmatched: 'packing.view',
  pairs: 'sku_stock.view',
  bins: 'sku_stock.view',
  tracking: 'receiving.view',
  claim: 'receiving.view',
  short: 'receiving.view',
  unfound: 'receiving.view',
};

export function canSeeExceptionKind(has: (permission: PermissionString) => boolean, kind: ExceptionKind): boolean {
  return has(EXCEPTION_KIND_PERMISSION[kind]);
}

/** The kinds `has` may see, in {@link EXCEPTION_KINDS} order. */
export function visibleExceptionKinds(has: (permission: PermissionString) => boolean): ExceptionKind[] {
  return EXCEPTION_KINDS.filter((kind) => canSeeExceptionKind(has, kind));
}

/**
 * The ONE category a hub URL lands on (owner 2026-09-29: never a blanket list —
 * every view is one kind, so its table and resolver can be built for it). A
 * visible `kind` wins (its domain follows it); else the first visible kind of
 * the requested domain; else the first visible kind of any domain. `null` =
 * the caller may see no kind at all.
 */
export function exceptionLanding(
  has: (permission: PermissionString) => boolean,
  requested: { domain: ExceptionDomain | null; kind: ExceptionKind | null },
): { domain: ExceptionDomain; kind: ExceptionKind } | null {
  const visible = visibleExceptionKinds(has);
  const kind =
    (requested.kind && visible.includes(requested.kind) ? requested.kind : null) ??
    visible.find((candidate) => !requested.domain || EXCEPTION_KIND_SPEC[candidate].domain === requested.domain) ??
    visible[0];
  return kind ? { domain: EXCEPTION_KIND_SPEC[kind].domain, kind } : null;
}
