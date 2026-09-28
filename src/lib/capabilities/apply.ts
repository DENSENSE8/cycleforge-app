/**
 * The apply path of `org.enable_capability` (review class: applied by the
 * operator's "yes" in chat, or any reviewer). Runs inside the review
 * transaction; the state change and its ledger row commit with the mutation.
 *
 * Enabling lands `active` when every prerequisite is met, else `setting_up`
 * (e.g. eBay import waits for the eBay connection). The inverse restores the
 * prior state, so "undo that" turns it back off.
 */

import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { BASE_CAPABILITY_ID, getCapability } from './catalog';
import { enabledStateFor, loadConnectionFacts, transitionCapability, viewCapability } from './store';

export const ENABLE_CAPABILITY_KIND = 'org.enable_capability';

export const capabilityEnablePayloadSchema = z
  .object({
    capabilityId: z.string().min(1).max(60),
    /** The staffer who asked (the chat caller) — stamped on the row and the ledger. */
    staffId: z.number().int().positive().nullable(),
    /** The inverse: put the capability back in this state. */
    restoreState: z.enum(['locked', 'suggested', 'setting_up', 'active']).optional(),
  })
  .strict();

type DispatchResult =
  | { ok: true; inverse: { kind: string; payload: Record<string, unknown> } | null; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function dispatchCapabilityEnable(
  client: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  payload: Record<string, unknown>,
): Promise<DispatchResult> {
  const parsed = capabilityEnablePayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, status: 400, error: `invalid ${ENABLE_CAPABILITY_KIND} payload — ${parsed.error.message}` };
  const { capabilityId, staffId, restoreState } = parsed.data;
  const def = getCapability(capabilityId);
  if (!def || def.id === BASE_CAPABILITY_ID) return { ok: false, status: 404, error: `unknown capability "${capabilityId}"` };

  const toState =
    restoreState ??
    enabledStateFor(viewCapability(def, null, await loadConnectionFacts(orgId, client)));
  const moved = await transitionCapability(client, {
    orgId,
    capabilityId,
    toState,
    staffId,
    source: 'chat',
    detail: restoreState ? { revert: true } : {},
  });
  return {
    ok: true,
    inverse: moved.changed
      ? { kind: ENABLE_CAPABILITY_KIND, payload: { capabilityId, staffId, restoreState: moved.fromState } }
      : null,
    targetRef: capabilityId,
  };
}
