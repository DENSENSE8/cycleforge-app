/**
 * The next verbs for an identified record. Orders read the outbound workflow
 * registry (`resolveOutboundWorkflowFacts`) — the same verdict the desk and the
 * phone rows render — so identify never offers a verb the desk would refuse.
 */

import type { DeskViewId } from '@/lib/outbound/desk-views';
import { journeyHandoffHref, searchScopeHref } from '@/lib/search/search-hit';
import { resolveOutboundWorkflowFacts } from '@/lib/shipping/outbound-workflow-facts';
import { recordHref } from './record-href';
import type { IdentifyAction, IdentifyKind } from './schema';

export interface ActionFacts {
  kind: IdentifyKind;
  entityId: number;
  deskView: DeskViewId | null;
  shipmentId: number | null;
  hasPickScan: boolean;
  packed: boolean;
  staged: boolean;
  outOfStock: boolean;
  sku: string | null;
  tracking: string | null;
}

const OPEN: IdentifyAction = { id: 'open', label: 'Open' };

export function identifyActions(facts: ActionFacts): IdentifyAction[] {
  const actions: IdentifyAction[] = [OPEN];

  if (facts.kind === 'order') {
    if (facts.deskView === 'exceptions') {
      actions.push({
        id: 'resolve_exception',
        label: 'Resolve exception',
        href: recordHref({ kind: 'order', entityId: facts.entityId, deskView: 'exceptions' }),
      });
    }
    if (facts.deskView !== 'shipped') {
      const workflow = resolveOutboundWorkflowFacts({
        shipmentId: facts.shipmentId,
        hasPickScan: facts.hasPickScan,
        packedAt: facts.packed ? 'packed' : null,
        dockStagedAt: facts.staged ? 'staged' : null,
        isOutOfStock: facts.outOfStock,
      });
      const enabled = Object.values(workflow.actions).filter((a) => a.enabled);
      // Primary verbs first, registry order within each state.
      for (const state of ['primary', 'available'] as const) {
        for (const action of enabled) {
          if (action.state === state) actions.push({ id: action.id, label: action.label });
        }
      }
    }
  }

  if (facts.kind === 'sku' && facts.sku) {
    const href = searchScopeHref('SKU', facts.sku);
    if (href) actions.push({ id: 'find_stock', label: 'Find in inventory', href });
  }

  const trace = journeyHandoffHref({
    id: facts.entityId,
    entityType: facts.kind,
    facets: { tracking_number: facts.tracking },
  });
  if (trace) actions.push({ id: 'trace', label: 'Trace history', href: trace });

  return actions;
}
