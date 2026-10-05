/**
 * Inbound › Inbound (`/incoming`, `incoming.pipeline`) sidebar facet: the
 * delivery-state walk — what is on the dock first, what has no tracking last —
 * writing `?state=`, the param `useReceivingModeContext` sends the list as
 * `delivery_state`. Counts are the lane's own summary (`getIncomingSummary`,
 * purchases per state over the `view=incoming` rows); these were the body's
 * status chips (ruling A4: a status that filters is a sidebar control).
 *
 * A pasted list (`?ref_in=`) and the Exceptions lane (`?lane=exceptions`)
 * load their own populations and ignore `?state=`, so there the group offers
 * nothing to pick.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import type { IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';
import { INCOMING_DELIVERY_STATE_FACE, INCOMING_STATE_FACET } from '@/lib/receiving/incoming-delivery-state-face';
import { REF_IN_PARAM } from '@/lib/receiving/reconcile';
import { parseInboundLane } from '@/lib/receiving/inbound-lane';

type ParamReader = Pick<URLSearchParams, 'get'>;

export async function incomingPipelineFacets(
  params: ParamReader,
  readSummary: () => Promise<IncomingSummary>,
): Promise<NavFacetsResponse> {
  const group = NAV_FACET_GROUPS['incoming.pipeline'].find((g) => g.id === 'state')!;
  const ownPopulation = Boolean(params.get(REF_IN_PARAM)?.trim()) || parseInboundLane(params.get('lane')) === 'exceptions';
  if (ownPopulation) {
    return { context: 'incoming.pipeline', total: 0, groups: [{ id: group.id, label: group.label, param: group.param, options: [] }] };
  }
  const summary = await readSummary();
  const options = INCOMING_STATE_FACET.map(({ state, label }) => ({
    value: state,
    label,
    count: Number(summary[INCOMING_DELIVERY_STATE_FACE[state].summaryKey]) || 0,
  }));
  const selected = (params.get(group.param) || '').trim().toUpperCase();
  const picked = options.find((option) => option.value === selected);
  return {
    context: 'incoming.pipeline',
    total: picked ? picked.count : Number(summary.issued) || 0,
    groups: [{ id: group.id, label: group.label, param: group.param, options }],
  };
}
