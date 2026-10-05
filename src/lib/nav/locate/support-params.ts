/**
 * /support's Find vocabulary (`NavSearch.locate` for the support locator).
 * Pure — the page declaration, the route registry and the locator import it;
 * the answer lives in `./support`.
 */

import type { NavSearch } from '@/lib/nav/context/schema';
import { SUPPORT_LOCAL_STATUSES } from '@/lib/support/conversation/model';

/** The pasted list — the operator's strings, comma-joined (the desk's word). */
export const SUPPORT_LOCATE_REFS_PARAM = 'refs';

/** The bucket filter over the pasted list — one local status. Never `status`: that is the page's chip param. */
export const SUPPORT_LOCATE_STATUS_PARAM = 'located';

/** The Support list's own gate (`GET /api/support/list`) — the locator's. */
export const SUPPORT_LOCATE_PERMISSION = 'support.thread.view';

export const SUPPORT_LOCATE: NonNullable<NavSearch['locate']> = {
  locator: 'support',
  param: SUPPORT_LOCATE_REFS_PARAM,
  statusParam: SUPPORT_LOCATE_STATUS_PARAM,
};

/** `?located=` values — the support bucket ids (the local statuses), in bucket order. */
export const SUPPORT_LOCATE_STATUSES = SUPPORT_LOCAL_STATUSES;
