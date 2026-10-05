/**
 * The Incoming desk's paste-a-list URL vocabulary (`NavSearch.locate` for the
 * inbound locator): `?ref_in=` the pasted numbers, `?recon=` one bucket,
 * `?recon_reason=` one reason inside it. Pure — the page decls and the
 * ledger's own status row read the same one.
 */

import type { NavSearch } from '@/lib/nav/context/schema';
import { RECON_PARAM, RECON_REASON_PARAM, REF_IN_PARAM } from '@/lib/receiving/reconcile';

export const INBOUND_LOCATE = {
  locator: 'inbound',
  param: REF_IN_PARAM,
  statusParam: RECON_PARAM,
  facetParam: RECON_REASON_PARAM,
} as const satisfies NonNullable<NavSearch['locate']>;
