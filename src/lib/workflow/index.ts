/** Workflow engine — public API. */

import type { OrgId } from '@/lib/tenancy/constants';
import { advanceItem, type AdvanceArgs, type AdvanceOutcome } from './advance';
import { getNode } from './registry';
import { createDrizzleStore } from './store';
import { emitWorkflowEvent } from './events';
import { redisAdvanceLock } from './lock';

// Built-in nodes register via import side-effect (each module calls
// registerNode()). Importing this barrel wires the full palette; tests that
// want an empty registry import ./advance, ./registry etc. directly.
import './nodes/receiving.node';
import './nodes/inspection.node';
import './nodes/repair.node';
import './nodes/data-wipe.node';
import './nodes/list-ebay.node';
import './nodes/list.node';
import './nodes/pack.node';
import './nodes/kit-verify.node';
import './nodes/ship.node';
import './nodes/returns.node';
import './nodes/rtv.node';
import './nodes/parts-harvest.node';
import './nodes/decision.node';

/**
 * Builtins register when this module loads (the side-effect imports above),
 * so this is a no-op. Module-private — nothing outside calls it.
 */
function registerBuiltins(): void {
  /* no-op */
}

/** Advance one item through its active workflow using the production wiring. */
export async function advance(
  orgId: OrgId,
  args: Omit<AdvanceArgs, 'orgId'>,
): Promise<AdvanceOutcome> {
  registerBuiltins();
  return advanceItem(
    {
      store: createDrizzleStore(orgId),
      getNode,
      emit: (event) => emitWorkflowEvent(orgId, event),
      // Phase 1.0: real per-unit mutex (best-effort Upstash; no-op without it).
      lock: redisAdvanceLock,
    },
    { orgId, ...args },
  );
}

export { listNodeMeta, getNode, hasNode } from './registry';
export * from './contract';
